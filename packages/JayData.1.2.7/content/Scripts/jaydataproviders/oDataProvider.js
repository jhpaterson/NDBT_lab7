// JayData 1.2.7
// Dual licensed under MIT and GPL v2
// Copyright JayStack Technologies (http://jaydata.org/licensing)
//
// JayData is a standards-based, cross-platform Javascript library and a set of
// practices to access and manipulate data from various online and offline sources.
//
// Credits:
//     Hajnalka Battancs, D�niel J�zsef, J�nos Roden, L�szl� Horv�th, P�ter Nochta
//     P�ter Zentai, R�bert B�nay, Szabolcs Czinege, Viktor Borza, Viktor L�z�r,
//     Zolt�n Gyebrovszki, G�bor Dolla
//
// More info: http://jaydata.org

$C('$data.storageProviders.oData.oDataProvider', $data.StorageProviderBase, null,
{
    constructor: function (cfg, ctx) {
        if (typeof OData === 'undefined') {
            Guard.raise(new Exception('datajs is required', 'Not Found!'));
        }

        this.SqlCommands = [];
        this.context = ctx;
        this.providerConfiguration = $data.typeSystem.extend({
            dbCreation: $data.storageProviders.DbCreationType.DropTableIfChanged,
            oDataServiceHost: "/odata.svc",
            serviceUrl: "",
            maxDataServiceVersion: '2.0',
            user: null,
            password: null,
            withCredentials: false,
            enableJSONP: false
        }, cfg);
        if (this.context && this.context._buildDbType_generateConvertToFunction && this.buildDbType_generateConvertToFunction) {
            this.context._buildDbType_generateConvertToFunction = this.buildDbType_generateConvertToFunction;
        }
        if (this.context && this.context._buildDbType_modifyInstanceDefinition && this.buildDbType_modifyInstanceDefinition) {
            this.context._buildDbType_modifyInstanceDefinition = this.buildDbType_modifyInstanceDefinition;
        }
    },
    initializeStore: function (callBack) {
        callBack = $data.typeSystem.createCallbackSetting(callBack);
        switch (this.providerConfiguration.dbCreation) {
            case $data.storageProviders.DbCreationType.DropAllExistingTables:
                var that = this;
                if (this.providerConfiguration.serviceUrl) {

                    var requestData = [{
                        requestUri: that.providerConfiguration.serviceUrl + "/Delete",
                        method: 'POST'
                    }, function (d) {
                        //console.log("RESET oData database");
                        callBack.success(that.context);
                    }, function (error) {
                        callBack.success(that.context);
                    }];

                    this.appendBasicAuth(requestData[0], this.providerConfiguration.user, this.providerConfiguration.password, this.providerConfiguration.withCredentials);
                    //if (this.providerConfiguration.user) {
                    //    requestData[0].user = this.providerConfiguration.user;
                    //    requestData[0].password = this.providerConfiguration.password || "";
                    //}

                    this.context.prepareRequest.call(this, requestData);
                    OData.request.apply(this, requestData);
                } else {
                    callBack.success(that.context);
                }
                break;
            default:
                callBack.success(this.context);
                break;
        }
    },
    buildDbType_generateConvertToFunction: function (storageModel, context) {
        return function (logicalEntity, convertedItems) {
            var dbInstance = new storageModel.PhysicalType();
            dbInstance.entityState = logicalEntity.entityState;

            storageModel.PhysicalType.memberDefinitions.getPublicMappedProperties().forEach(function (property) {
                dbInstance[property.name] = logicalEntity[property.name];
            }, this);

            if (storageModel.Associations) {
                storageModel.Associations.forEach(function (association) {
                    if ((association.FromMultiplicity == "*" && association.ToMultiplicity == "0..1") ||
                        (association.FromMultiplicity == "0..1" && association.ToMultiplicity == "1") ||
                        (association.FromMultiplicity == '$$unbound')) {
                        var refValue = logicalEntity[association.FromPropertyName];
                        if (/*refValue !== null &&*/ refValue !== undefined) {
                            if (refValue instanceof $data.Array) {
                                dbInstance[association.FromPropertyName] = dbInstance[association.FromPropertyName] || [];
                                refValue.forEach(function (rv) {
                                    var contentId = convertedItems.indexOf(rv);
                                    if (contentId < 0) { Guard.raise("Dependency graph error"); }
                                    dbInstance[association.FromPropertyName].push({ __metadata: { uri: "$" + (contentId + 1) } });
                                }, this);
                            } else if (refValue === null) {
                                dbInstance[association.FromPropertyName] = null;
                            } else {
                                if (convertedItems.indexOf(refValue) < 0) {
                                    var sMod = context._storageModel.getStorageModel(refValue.getType())
                                    var tblName = sMod.TableName;
                                    var pk = '(' + context.storageProvider.getEntityKeysValue({ data: refValue, entitySet: context.getEntitySetFromElementType(refValue.getType()) }) + ')';
                                    dbInstance[association.FromPropertyName] = { __metadata: { uri: tblName + pk } };
                                } else {
                                    var contentId = convertedItems.indexOf(refValue);
                                    if (contentId < 0) { Guard.raise("Dependency graph error"); }
                                    dbInstance[association.FromPropertyName] = { __metadata: { uri: "$" + (contentId + 1) } };
                                }
                            }
                        }
                    }
                }, this);
            }
            if (storageModel.ComplexTypes) {
                storageModel.ComplexTypes.forEach(function (cmpType) {
                    dbInstance[cmpType.FromPropertyName] = logicalEntity[cmpType.FromPropertyName];
                }, this);
            }
            return dbInstance;
        };
    },
    buildDbType_modifyInstanceDefinition: function () { return; },
    executeQuery: function (query, callBack) {
        callBack = $data.typeSystem.createCallbackSetting(callBack);

        var sql;
        try {
            sql = this._compile(query);
        } catch (e) {
            callBack.error(e);
            return;
        }
        var schema = this.context;

        var requestData = [
            {
                requestUri: this.providerConfiguration.oDataServiceHost + sql.queryText,
                method: sql.method,
                data: sql.postData,
                enableJsonpCallback: this.providerConfiguration.enableJSONP,
                headers: {
                    MaxDataServiceVersion: this.providerConfiguration.maxDataServiceVersion
                }
            },
            function (data, textStatus, jqXHR) {
                if (!data && textStatus.body) data = JSON.parse(textStatus.body);
                if (callBack.success) {
                    query.rawDataList = typeof data === 'string' ? [{ cnt: data }] : data;
                    if (sql.withInlineCount && typeof data === 'object' && (data.__count || ('d' in data && data.d.__count))) {
                        query.__count = new Number(data.__count || data.d.__count).valueOf();
                    }

                    callBack.success(query);
                }
            },
            function (jqXHR, textStatus, errorThrow) {
                callBack.error(errorThrow || new Exception('Request failed', 'RequestError', arguments));
            }
        ];

        this.appendBasicAuth(requestData[0], this.providerConfiguration.user, this.providerConfiguration.password, this.providerConfiguration.withCredentials);
        //if (this.providerConfiguration.user) {
        //    requestData[0].user = this.providerConfiguration.user;
        //    requestData[0].password = this.providerConfiguration.password || "";
        //}

        this.context.prepareRequest.call(this, requestData);
        //$data.ajax(requestData);
        //OData.request(requestData, requestData.success, requestData.error);
        OData.request.apply(this, requestData);
    },
    _compile: function (queryable, params) {
        var compiler = new $data.storageProviders.oData.oDataCompiler();
        var compiled = compiler.compile(queryable);
        return compiled;
    },
    saveChanges: function (callBack, changedItems) {
        if (changedItems.length > 0) {
            var independentBlocks = this.buildIndependentBlocks(changedItems);
            this.saveInternal(independentBlocks, 0, callBack);
        }
        else {
            callBack.success(0);
        }
    },
    saveInternal: function (independentBlocks, index2, callBack) {
        if (independentBlocks.length > 1 || (independentBlocks.length == 1 && independentBlocks[0].length > 1))
            this._saveBatch(independentBlocks, index2, callBack);
        else
            this._saveRest(independentBlocks, index2, callBack);
    },
    _saveRest: function (independentBlocks, index2, callBack) {
        var batchRequests = [];
        var convertedItem = [];
        var request;
        for (var index = 0; index < independentBlocks.length; index++) {
            for (var i = 0; i < independentBlocks[index].length; i++) {
                convertedItem.push(independentBlocks[index][i].data);
                request = {
                    requestUri: this.providerConfiguration.oDataServiceHost + '/',
                    headers: {
                        MaxDataServiceVersion: this.providerConfiguration.maxDataServiceVersion
                    }
                };
                //request.headers = { "Content-Id": convertedItem.length };
                switch (independentBlocks[index][i].data.entityState) {
                    case $data.EntityState.Unchanged: continue; break;
                    case $data.EntityState.Added:
                        request.method = "POST";
                        request.requestUri += independentBlocks[index][i].entitySet.tableName;
                        request.data = this.save_getInitData(independentBlocks[index][i], convertedItem);
                        break;
                    case $data.EntityState.Modified:
                        request.method = "MERGE";
                        request.requestUri += independentBlocks[index][i].entitySet.tableName;
                        request.requestUri += "(" + this.getEntityKeysValue(independentBlocks[index][i]) + ")";
                        this.save_addConcurrencyHeader(independentBlocks[index][i], request.headers);
                        request.data = this.save_getInitData(independentBlocks[index][i], convertedItem);
                        break;
                    case $data.EntityState.Deleted:
                        request.method = "DELETE";
                        request.requestUri += independentBlocks[index][i].entitySet.tableName;
                        request.requestUri += "(" + this.getEntityKeysValue(independentBlocks[index][i]) + ")";
                        this.save_addConcurrencyHeader(independentBlocks[index][i], request.headers);
                        break;
                    default: Guard.raise(new Exception("Not supported Entity state"));
                }
                //batchRequests.push(request);
            }
        }
        var that = this;

        var requestData = [request, function (data, response) {
            if (response.statusCode > 200 && response.statusCode < 300) {
                var item = convertedItem[0];
                if (response.statusCode == 204) {
                    if (response.headers.ETag || response.headers.Etag || response.headers.etag) {
                        var property = item.getType().memberDefinitions.getPublicMappedProperties().filter(function (memDef) { return memDef.concurrencyMode === $data.ConcurrencyMode.Fixed });
                        if (property && property[0]) {
                            item[property[0].name] = response.headers.ETag || response.headers.Etag || response.headers.etag;
                        }
                    }
                } else {
                    item.getType().memberDefinitions.getPublicMappedProperties().forEach(function (memDef) {
                        var propType = Container.resolveType(memDef.type);
                        if (memDef.computed || memDef.key || (!propType.isAssignableto && !memDef.inverseProperty)) {
                            if (memDef.concurrencyMode === $data.ConcurrencyMode.Fixed) {
                                item[memDef.name] = response.headers.ETag || response.headers.Etag || response.headers.etag;
                            } else {
                                var converter = that.fieldConverter.fromDb[Container.resolveName(memDef.type)];
                                item[memDef.name] = converter ? converter(data[memDef.name]) : data[memDef.name];
                            }
                        }
                    }, this);
                }

                if (callBack.success) {
                    callBack.success(convertedItem.length);
                }
            } else {
                callBack.error(response);
            }

        }, function (e) {
            callBack.error(new Exception((e.response || {}).body, e.message, e));
        }];

        this.appendBasicAuth(requestData[0], this.providerConfiguration.user, this.providerConfiguration.password, this.providerConfiguration.withCredentials);
        //if (this.providerConfiguration.user) {
        //    requestData[0].user = this.providerConfiguration.user;
        //    requestData[0].password = this.providerConfiguration.password || "";
        //}

        this.context.prepareRequest.call(this, requestData);
        OData.request.apply(this, requestData);
    },
    _saveBatch: function (independentBlocks, index2, callBack) {
        var batchRequests = [];
        var convertedItem = [];
        for (var index = 0; index < independentBlocks.length; index++) {
            for (var i = 0; i < independentBlocks[index].length; i++) {
                convertedItem.push(independentBlocks[index][i].data);
                var request = {};
                request.headers = { "Content-Id": convertedItem.length };
                switch (independentBlocks[index][i].data.entityState) {
                    case $data.EntityState.Unchanged: continue; break;
                    case $data.EntityState.Added:
                        request.method = "POST";
                        request.requestUri = independentBlocks[index][i].entitySet.tableName;
                        request.data = this.save_getInitData(independentBlocks[index][i], convertedItem);
                        break;
                    case $data.EntityState.Modified:
                        request.method = "MERGE";
                        request.requestUri = independentBlocks[index][i].entitySet.tableName;
                        request.requestUri += "(" + this.getEntityKeysValue(independentBlocks[index][i]) + ")";
                        this.save_addConcurrencyHeader(independentBlocks[index][i], request.headers);
                        request.data = this.save_getInitData(independentBlocks[index][i], convertedItem);
                        break;
                    case $data.EntityState.Deleted:
                        request.method = "DELETE";
                        request.requestUri = independentBlocks[index][i].entitySet.tableName;
                        request.requestUri += "(" + this.getEntityKeysValue(independentBlocks[index][i]) + ")";
                        this.save_addConcurrencyHeader(independentBlocks[index][i], request.headers);
                        break;
                    default: Guard.raise(new Exception("Not supported Entity state"));
                }
                batchRequests.push(request);
            }
        }
        var that = this;

        var requestData = [{
            requestUri: this.providerConfiguration.oDataServiceHost + "/$batch",
            method: "POST",
            data: {
                __batchRequests: [{ __changeRequests: batchRequests }]
            },
            headers: {
                MaxDataServiceVersion: this.providerConfiguration.maxDataServiceVersion
            }
        }, function (data, response) {
            if (response.statusCode == 202) {
                var result = data.__batchResponses[0].__changeResponses;
                var errors = [];

                for (var i = 0; i < result.length; i++) {
                    if (result[i].statusCode > 200 && result[i].statusCode < 300) {
                        var item = convertedItem[i];
                        if (result[i].statusCode == 204) {
                            if (result[i].headers.ETag || result[i].headers.Etag || result[i].headers.etag) {
                                var property = item.getType().memberDefinitions.getPublicMappedProperties().filter(function (memDef) { return memDef.concurrencyMode === $data.ConcurrencyMode.Fixed });
                                if (property && property[0]) {
                                    item[property[0].name] = result[i].headers.ETag || result[i].headers.Etag || result[i].headers.etag;
                                }
                            }
                            continue;
                        }

                        item.getType().memberDefinitions.getPublicMappedProperties().forEach(function (memDef) {
                            //TODO: is this correct?
                            var propType = Container.resolveType(memDef.type);
                            if (memDef.computed || memDef.key || (!propType.isAssignableto && !memDef.inverseProperty)) {
                                if (memDef.concurrencyMode === $data.ConcurrencyMode.Fixed) {
                                    item[memDef.name] = result[i].headers.ETag || result[i].headers.Etag || result[i].headers.etag;
                                } else {
                                    var converter = that.fieldConverter.fromDb[Container.resolveName(memDef.type)];
                                    item[memDef.name] = converter ? converter(result[i].data[memDef.name]) : result[i].data[memDef.name];
                                }
                            }
                        }, this);

                    } else {
                        errors.push(new Exception((result[i].response || {}).body, result[i].message, result[i]));
                    }
                }
                if (errors.length > 0) {
                    callBack.error(new Exception('See inner exceptions','Batch failed', errors));
                } else if (callBack.success) {
                    callBack.success(convertedItem.length);
                }
            } else {
                callBack.error(response);
            }

        }, function (e) {
            callBack.error(new Exception((e.response || {}).body, e.message, e));
        }, OData.batchHandler];

        this.appendBasicAuth(requestData[0], this.providerConfiguration.user, this.providerConfiguration.password, this.providerConfiguration.withCredentials);
        //if (this.providerConfiguration.user) {
        //    requestData[0].user = this.providerConfiguration.user;
        //    requestData[0].password = this.providerConfiguration.password || "";
        //}

        this.context.prepareRequest.call(this, requestData);
        OData.request.apply(this, requestData);
    },
    save_getInitData: function (item, convertedItems) {
        item.physicalData = this.context._storageModel.getStorageModel(item.data.getType()).PhysicalType.convertTo(item.data, convertedItems);
        var serializableObject = {}
        item.physicalData.getType().memberDefinitions.asArray().forEach(function (memdef) {
            if (memdef.kind == $data.MemberTypes.navProperty || memdef.kind == $data.MemberTypes.complexProperty || (memdef.kind == $data.MemberTypes.property && !memdef.notMapped)) {
                if (typeof memdef.concurrencyMode === 'undefined' && (memdef.key === true || item.data.entityState === $data.EntityState.Added || item.data.changedProperties.some(function(def){ return def.name === memdef.name; })))
                    serializableObject[memdef.name] = item.physicalData[memdef.name];
            }
        }, this);
        return serializableObject;
    },
    save_addConcurrencyHeader: function (item, headers) {
        var property = item.data.getType().memberDefinitions.getPublicMappedProperties().filter(function (memDef) { return memDef.concurrencyMode === $data.ConcurrencyMode.Fixed });
        if (property && property[0]) {
            headers['If-Match'] = item.data[property[0].name];
            //item.data[property[0].name] = "";
        }
    },
    getTraceString: function (queryable) {
        var sqlText = this._compile(queryable);
        return queryable;
    },
    supportedDataTypes: {
        value: [$data.Integer, $data.String, $data.Number, $data.Blob, $data.Boolean, $data.Date, $data.Object, $data.GeographyPoint, $data.Guid,
            $data.GeographyLineString, $data.GeographyPolygon, $data.GeographyMultiPoint, $data.GeographyMultiLineString, $data.GeographyMultiPolygon, $data.GeographyCollection,
            $data.GeometryPoint, $data.GeometryLineString, $data.GeometryPolygon, $data.GeometryMultiPoint, $data.GeometryMultiLineString, $data.GeometryMultiPolygon, $data.GeometryCollection],
        writable: false
    },

    supportedBinaryOperators: {
        value: {
            equal: { mapTo: 'eq', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            notEqual: { mapTo: 'ne', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            equalTyped: { mapTo: 'eq', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            notEqualTyped: { mapTo: 'ne', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            greaterThan: { mapTo: 'gt', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            greaterThanOrEqual: { mapTo: 'ge', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },

            lessThan: { mapTo: 'lt', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            lessThenOrEqual: { mapTo: 'le', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            or: { mapTo: 'or', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            and: { mapTo: 'and', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },

            add: { mapTo: 'add', dataType: "number", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            divide: { mapTo: 'div', allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            multiply: { mapTo: 'mul', allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            subtract: { mapTo: 'sub', allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },
            modulo: { mapTo: 'mod', allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] },

            "in": { mapTo: "in", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression] }
        }
    },

    supportedUnaryOperators: {
        value: {
            not: { mapTo: 'not' }
        }
    },

    supportedFieldOperations: {
        value: {
            /* string functions */

            contains: {
                mapTo: "substringof",
                dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "substring", dataType: "string" }, { name: "@expression" }]
            },

            startsWith: {
                mapTo: "startswith",
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "string" }, { name: "strFragment", dataType: "string" }]
            },

            endsWith: {
                mapTo: "endswith",
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "string" }, { name: "strFragment", dataType: "string" }]
            },

            length: [{
                allowedType: 'string',
                dataType: "number", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.ProjectionExpression],
                parameters: [{ name: "@expression", dataType: "string" }]
            },
            {
                allowedType: 'GeographyLineString',
                mapTo: "geo.length",
                dataType: "number", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: ['GeographyLineString'] }],
                fixedDataType: 'decimal'
            },
            {
                allowedType: 'GeometryLineString',
                mapTo: "geo.length",
                dataType: "number", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: 'GeometryLineString' }],
                fixedDataType: 'decimal'
            }],

            strLength: {
                mapTo: "length",
                dataType: "number", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.ProjectionExpression],
                parameters: [{ name: "@expression", dataType: "string" }]
            },

            indexOf: {
                dataType: "number", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                mapTo: "indexof",
                baseIndex: 1,
                parameters: [{ name: '@expression', dataType: "string" }, { name: 'strFragment', dataType: 'string' }]
            },

            replace: {
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: '@expression', dataType: "string" }, { name: 'strFrom', dataType: 'string' }, { name: 'strTo', dataType: 'string' }]
            },

            substr: {
                mapTo: "substring",
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "string" }, { name: "startFrom", dataType: "number" }, { name: "length", dataType: "number", optional: "true" }]
            },

            toLowerCase: {
                mapTo: "tolower",
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "string" }]
            },

            toUpperCase: {
                mapTo: "toupper",
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "string" }]

            },

            trim: {
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "string" }]
            },


            concat: {
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "string" }, { name: "strFragment", dataType: "string" }]
            },


            /* data functions */

            day: {
                allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            hour: {
                allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            minute: {
                allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            month: {
                allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            second: {
                allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            year: {
                allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },

            /* number functions */
            round: {
                allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            floor: {
                allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            ceiling: {
                allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },


            /* geo functions */
            distance: [{
                allowedType: 'GeographyPoint',
                mapTo: "geo.distance",
                dataType: "number", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: 'GeographyPoint' }, { name: "to", dataType: 'GeographyPoint' }],
                fixedDataType: 'decimal'
            }, {
                allowedType: 'GeometryPoint',
                mapTo: "geo.distance",
                dataType: "number", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: 'GeometryPoint' }, { name: "to", dataType: 'GeometryPoint' }],
                fixedDataType: 'decimal'
            }],

            intersects: [{
                allowedType: 'GeographyPoint',
                mapTo: "geo.intersects",
                dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: 'GeographyPoint' }, { name: "in", dataType: 'GeographyPolygon' }]

            }, {
                allowedType: 'GeometryPoint',
                mapTo: "geo.intersects",
                dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.OrderExpression],
                parameters: [{ name: "@expression", dataType: 'GeometryPoint' }, { name: "in", dataType: 'GeometryPolygon' }]

            }]
        },
        enumerable: true,
        writable: true
    },
    supportedSetOperations: {
        value: {
            filter: {},
            map: {},
            length: {},
            forEach: {},
            toArray: {},
            single: {},
            some: {
                invokable: false,
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "filter", dataType: "$data.Queryable" }],
                mapTo: 'any',
                frameType: $data.Expressions.SomeExpression
            },
            every: {
                invokable: false,
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "filter", dataType: "$data.Queryable" }],
                mapTo: 'all',
                frameType: $data.Expressions.EveryExpression
            },
            take: {},
            skip: {},
            orderBy: {},
            orderByDescending: {},
            first: {},
            include: {},
            batchDelete: {},
            withInlineCount: {}
        },
        enumerable: true,
        writable: true
    },
    fieldConverter: {
        value: {
            fromDb: {
                '$data.Integer': function (number) { return (typeof number === 'string' && /^\d+$/.test(number)) ? parseInt(number) : number; },
                '$data.Number': function (number) { return number; },
                '$data.Date': function (dbData) {
                    if (dbData) {
                        if (dbData.substring(0, 6) === '/Date(') {
                            return new Date(parseInt(dbData.substr(6)));
                        } else {
                            //ISODate without Z? Safari compatible with Z
                            if (dbData.indexOf('Z') === -1 && !dbData.match('T.*[+-]'))
                                dbData += 'Z';
                            return new Date(dbData);
                        }
                    } else {
                        return dbData;
                    }
                },
                '$data.String': function (text) { return text; },
                '$data.Boolean': function (bool) { return bool; },
                '$data.Blob': function (blob) { return blob; },
                '$data.Object': function (o) { if (o === undefined) { return new $data.Object(); } else if (typeof o === 'string') { return JSON.parse(o); } return o; },
                '$data.Array': function (o) { if (o === undefined) { return new $data.Array(); } else if (o instanceof $data.Array) { return o; } return JSON.parse(o); },
                '$data.GeographyPoint': function (g) { if (g) { return new $data.GeographyPoint(g); } return g; },
                '$data.GeographyLineString': function (g) { if (g) { return new $data.GeographyLineString(g); } return g; },
                '$data.GeographyPolygon': function (g) { if (g) { return new $data.GeographyPolygon(g); } return g; },
                '$data.GeographyMultiPoint': function (g) { if (g) { return new $data.GeographyMultiPoint(g); } return g; },
                '$data.GeographyMultiLineString': function (g) { if (g) { return new $data.GeographyMultiLineString(g); } return g; },
                '$data.GeographyMultiPolygon': function (g) { if (g) { return new $data.GeographyMultiPolygon(g); } return g; },
                '$data.GeographyCollection': function (g) { if (g) { return new $data.GeographyCollection(g); } return g; },
                '$data.GeometryPoint': function (g) { if (g) { return new $data.GeometryPoint(g); } return g; },
                '$data.GeometryLineString': function (g) { if (g) { return new $data.GeometryLineString(g); } return g; },
                '$data.GeometryPolygon': function (g) { if (g) { return new $data.GeometryPolygon(g); } return g; },
                '$data.GeometryMultiPoint': function (g) { if (g) { return new $data.GeometryMultiPoint(g); } return g; },
                '$data.GeometryMultiLineString': function (g) { if (g) { return new $data.GeometryMultiLineString(g); } return g; },
                '$data.GeometryMultiPolygon': function (g) { if (g) { return new $data.GeometryMultiPolygon(g); } return g; },
                '$data.GeometryCollection': function (g) { if (g) { return new $data.GeometryCollection(g); } return g; },
                '$data.Guid': function (guid) { return guid ? new $data.Guid(guid) : guid; }
            },
            toDb: {
                '$data.Entity': function (e) { return "'" + JSON.stringify(e.initData) + "'" },
                '$data.Integer': function (number) { return number; },
                '$data.Number': function (number) { return number % 1 == 0 ? number : number + 'm'; },
                '$data.Date': function (date) { return date ? "datetime'" + date.toISOString() + "'" : null; },
                '$data.String': function (text) { return "'" + text.replace(/'/g, "''") + "'"; },
                '$data.Boolean': function (bool) { return bool ? 'true' : 'false'; },
                '$data.Blob': function (blob) { return blob; },
                '$data.Object': function (o) { return JSON.stringify(o); },
                '$data.Array': function (o) { return JSON.stringify(o); },
                '$data.GeographyPoint': function (g) { if (g) { return $data.Geography.stringifyToUrl(g); } return g; },
                '$data.GeographyLineString': function (g) { if (g) { return $data.Geography.stringifyToUrl(g); } return g; },
                '$data.GeographyPolygon': function (g) { if (g) { return $data.Geography.stringifyToUrl(g); } return g; },
                '$data.GeographyMultiPoint': function (g) { if (g) { return $data.Geography.stringifyToUrl(g); } return g; },
                '$data.GeographyMultiLineString': function (g) { if (g) { return $data.Geography.stringifyToUrl(g); } return g; },
                '$data.GeographyMultiPolygon': function (g) { if (g) { return $data.Geography.stringifyToUrl(g); } return g; },
                '$data.GeographyCollection': function (g) { if (g) { return $data.Geography.stringifyToUrl(g); } return g; },
                '$data.GeometryPoint': function (g) { if (g) { return $data.Geometry.stringifyToUrl(g); } return g; },
                '$data.GeometryLineString': function (g) { if (g) { return $data.Geometry.stringifyToUrl(g); } return g; },
                '$data.GeometryPolygon': function (g) { if (g) { return $data.Geometry.stringifyToUrl(g); } return g; },
                '$data.GeometryMultiPoint': function (g) { if (g) { return $data.Geometry.stringifyToUrl(g); } return g; },
                '$data.GeometryMultiLineString': function (g) { if (g) { return $data.Geometry.stringifyToUrl(g); } return g; },
                '$data.GeometryMultiPolygon': function (g) { if (g) { return $data.Geometry.stringifyToUrl(g); } return g; },
                '$data.GeometryCollection': function (g) { if (g) { return $data.Geometry.stringifyToUrl(g); } return g; },
                '$data.Guid': function (guid) { return guid ? ("guid'" + guid.value + "'") : guid; }
}
        }
    },
    resolveTypeOperations: function (operation, expression, frameType) {
        var memDef = expression.entityType.getMemberDefinition(operation);
        if (!memDef ||
            !memDef.method ||
            memDef.method.IsSideEffecting !== false ||
            !memDef.method.returnType ||
            !(frameType === $data.Expressions.FilterExpression || frameType === $data.Expressions.OrderExpression))
        {
            Guard.raise(new Exception("Entity '" + expression.entityType.name + "' Operation '" + operation + "' is not supported by the provider"));
        }

        return memDef;
    },
    resolveSetOperations: function (operation, expression, frameType) {
        if (expression) {
            var esDef = expression.storageModel.ContextType.getMemberDefinition(expression.storageModel.ItemName);
            if (esDef && esDef.actions && esDef.actions[operation]) {
                var memDef = $data.MemberDefinition.translateDefinition(esDef.actions[operation], operation, this.getType());
                if (!memDef ||
                    !memDef.method ||
                    memDef.method.IsSideEffecting !== false ||
                    !memDef.method.returnType ||
                    !(frameType === $data.Expressions.FilterExpression || frameType === $data.Expressions.OrderExpression)) {

                    Guard.raise(new Exception("Collection '" + expression.storageModel.ItemName + "' Operation '" + operation + "' is not supported by the provider"));
                }

                return memDef;
            }
        }
        return $data.StorageProviderBase.prototype.resolveSetOperations.apply(this, arguments);

    },
    resolveContextOperations: function (operation, expression, frameType) {
        var memDef = this.context.getType().getMemberDefinition(operation);
        if (!memDef ||
            !memDef.method ||
            memDef.method.IsSideEffecting !== false ||
            !memDef.method.returnType ||
            !(frameType === $data.Expressions.FilterExpression || frameType === $data.Expressions.OrderExpression)) {
            Guard.raise(new Exception("Context '" + expression.instance.getType().name + "' Operation '" + operation + "' is not supported by the provider"));
        }
        return memDef;
    },

    getEntityKeysValue: function (entity) {
        var result = [];
        var keyValue = undefined;
        var memDefs = entity.data.getType().memberDefinitions.getKeyProperties();
        for (var i = 0, l = memDefs.length; i < l; i++) {
            var field = memDefs[i];
            if (field.key) {
                keyValue = entity.data[field.name];
                switch (Container.getName(field.dataType)) {
                    case "$data.Guid":
                    case "Edm.Guid":
                        keyValue = ("guid'" + (keyValue ? keyValue.value : keyValue)  + "'");
                        break;
                    case "$data.Blob":
                    case "Edm.Binary":
                        keyValue = ("binary'" + keyValue + "'");
                        break;
                    case "Edm.Byte":
                        var hexDigits = '0123456789ABCDEF';
                        keyValue = (hexDigits[(i >> 4) & 15] + hexDigits[i & 15]);
                        break;
                    case "$data.Date":
                    case "Edm.DateTime":
                        keyValue = ("datetime'" + keyValue.toISOString() + "'");
                        break;
                    case "Edm.Decimal":
                        keyValue = (keyValue + "M");
                        break;
                    case "Edm.Single":
                        keyValue = (keyValue + "f");
                        break;
                    case "Edm.Int64":
                        keyValue = (keyValue + "L");
                        break;
                    case 'Edm.String':
                    case "$data.String":
                        keyValue = ("'" + keyValue + "'");
                        break;
                }
                result.push(field.name + "=" + keyValue);
            }
        }
        if (result.length > 1) {
            return result.join(",");
        }
        return keyValue;
    },/*
    getServiceMetadata: function () {
        $data.ajax(this._setAjaxAuthHeader({
            url: this.providerConfiguration.oDataServiceHost + "/$metadata",
            dataType: "xml",
            success: function (d) {
                console.log("OK");
                console.dir(d);
                console.log(typeof d);
                window["s"] = d;
                window["k"] = this.nsResolver;
                //s.evaluate("edmx:Edmx/edmx:DataServices/Schema", s, $data.storageProviders.oData.oDataProvider.prototype.nsResolver, XPathResult.ANY_TYPE, null).iterateNext()

            },
            error: function (error) {
                console.log("error:");
                console.dir(error);
            }
        }));
    },
    nsResolver: function (sPrefix) {
        switch (sPrefix) {
            case "edmx":
                return "http://schemas.microsoft.com/ado/2007/06/edmx";
                break;
            case "m":
                return "http://schemas.microsoft.com/ado/2007/08/dataservices/metadata";
                break;
            case "d":
                return "http://schemas.microsoft.com/ado/2007/08/dataservices";
                break;
            default:
                return "http://schemas.microsoft.com/ado/2008/09/edm";
                break;
        }
    }
    */
    appendBasicAuth: function (request, user, password, withCredentials) {
        request.headers = request.headers || {};
        if (!request.headers.Authorization && user && password) {
            request.headers.Authorization = "Basic " + this.__encodeBase64(user + ":" + password);
            request.withCredentials = withCredentials;
        }
    },
    __encodeBase64: function (val) {
        var b64array = "ABCDEFGHIJKLMNOP" +
                           "QRSTUVWXYZabcdef" +
                           "ghijklmnopqrstuv" +
                           "wxyz0123456789+/" +
                           "=";

        var input = val;
        var base64 = "";
        var hex = "";
        var chr1, chr2, chr3 = "";
        var enc1, enc2, enc3, enc4 = "";
        var i = 0;

        do {
            chr1 = input.charCodeAt(i++);
            chr2 = input.charCodeAt(i++);
            chr3 = input.charCodeAt(i++);

            enc1 = chr1 >> 2;
            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
            enc4 = chr3 & 63;

            if (isNaN(chr2)) {
                enc3 = enc4 = 64;
            } else if (isNaN(chr3)) {
                enc4 = 64;
            }

            base64 = base64 +
                        b64array.charAt(enc1) +
                        b64array.charAt(enc2) +
                        b64array.charAt(enc3) +
                        b64array.charAt(enc4);
            chr1 = chr2 = chr3 = "";
            enc1 = enc2 = enc3 = enc4 = "";
        } while (i < input.length);

        return base64;
    }
}, null);

$data.StorageProviderBase.registerProvider("oData", $data.storageProviders.oData.oDataProvider);
$C('$data.storageProviders.oData.oDataCompiler', $data.Expressions.EntityExpressionVisitor, null, {
    constructor: function () {
        this.context = {};
        this.provider = {};
        //this.logicalType = null;
        this.includes = null;
        this.mainEntitySet = null;
    },
    compile: function (query) {

        this.provider = query.context.storageProvider;
        this.context = query.context;
        this.mainEntitySet = query.context.getEntitySetFromElementType(query.defaultType);

        var queryFragments = { urlText: "" };
        
        this.Visit(query.expression, queryFragments);

        query.modelBinderConfig = {};
        var modelBinder = Container.createModelBinderConfigCompiler(query, this.includes, true);
        modelBinder.Visit(query.expression);


        var queryText = queryFragments.urlText;
        var addAmp = false;
        for (var name in queryFragments) {
            if (name != "urlText" && name != "actionPack" && name != "data" && name != "lambda" && name != "method" && name != "postData" && queryFragments[name] != "") {
                if (addAmp) { queryText += "&"; } else { queryText += "?"; }
                addAmp = true;
                if(name != "$urlParams"){
                    queryText += name + '=' + queryFragments[name];
                }else{
                    queryText += queryFragments[name];
                }
            }
        }
        query.queryText = queryText;
        
        return {
            queryText: queryText,
            withInlineCount: '$inlinecount' in queryFragments,
            method: queryFragments.method || 'GET',
            postData: queryFragments.postData,
            params: []
        };
    },
    VisitOrderExpression: function (expression, context) {
        this.Visit(expression.source, context);

        var orderCompiler = Container.createoDataOrderCompiler(this.provider);
        orderCompiler.compile(expression, context);
    },
    VisitPagingExpression: function (expression, context) {
        this.Visit(expression.source, context);

        var pagingCompiler = Container.createoDataPagingCompiler();
        pagingCompiler.compile(expression, context);
    },
    VisitIncludeExpression: function (expression, context) {
        this.Visit(expression.source, context);
        if (!context['$select']) {
            if (context['$expand']) { context['$expand'] += ','; } else { context['$expand'] = ''; }
            context['$expand'] += expression.selector.value.replace(/\./g, '/');

            this.includes = this.includes || [];
            var includeFragment = expression.selector.value.split('.');
            var tempData = null;
            var storageModel = this.mainEntitySet.entityContext._storageModel.getStorageModel(this.mainEntitySet.createNew);
            for (var i = 0; i < includeFragment.length; i++) {
                if (tempData) { tempData += '.' + includeFragment[i]; } else { tempData = includeFragment[i]; }
                var association = storageModel.Associations[includeFragment[i]];
                if (association) {
                    if (!this.includes.some(function (include) { return include.name == tempData }, this)) {
                        this.includes.push({ name: tempData, type: association.ToType });
                    }
                }
                else {
                    Guard.raise(new Exception("The given include path is invalid: " + expression.selector.value + ", invalid point: " + tempData));
                }
                storageModel = this.mainEntitySet.entityContext._storageModel.getStorageModel(association.ToType);
            }
        }
    },
    VisitProjectionExpression: function (expression, context) {
        this.Visit(expression.source, context);

        var projectionCompiler = Container.createoDataProjectionCompiler(this.context);
        projectionCompiler.compile(expression, context);
    },
    VisitFilterExpression: function (expression, context) {
        ///<param name="expression" type="$data.Expressions.FilterExpression" />

        this.Visit(expression.source, context);

        var filterCompiler = Container.createoDataWhereCompiler(this.provider);
        context.data = "";
        filterCompiler.compile(expression.selector, context);
        context["$filter"] = context.data;
        context.data = "";

    },
    VisitInlineCountExpression: function (expression, context) {
        this.Visit(expression.source, context);
        context["$inlinecount"] = expression.selector.value;
    },
    VisitEntitySetExpression: function (expression, context) {
        context.urlText += "/" + expression.instance.tableName;
        //this.logicalType = expression.instance.elementType;
        if (expression.params) {
            for (var i = 0; i < expression.params.length; i++) {
                this.Visit(expression.params[i], context);
            }
        }
    },
    VisitServiceOperationExpression: function (expression, context) {
        if (expression.bindedEntity) {
            context.urlText += "/" + expression.bindedEntity.entitySet.tableName;
            if (expression.bindedEntity.data instanceof $data.Entity) {
                context.urlText += '(' + this.provider.getEntityKeysValue(expression.bindedEntity) + ')';
            }
        }
        context.urlText += "/" + expression.cfg.serviceName;
        context.method = context.method || expression.cfg.method;

        //this.logicalType = expression.returnType;
        if (expression.params) {
            for (var i = 0; i < expression.params.length; i++) {
                this.Visit(expression.params[i], context);
            }
        }
    },
    VisitBatchDeleteExpression: function (expression, context) {
        this.Visit(expression.source, context);
        context.urlText += '/$batchDelete';
        context.method = 'DELETE';
    },

    VisitConstantExpression: function (expression, context) {
        if (context.method === 'GET' || !context.method) {
            var value;
            if (expression.value instanceof $data.Entity) {
                value = this.provider.fieldConverter.toDb['$data.Entity'](expression.value);
            } else if (expression.value !== undefined) {
                var valueType = Container.getTypeName(expression.value);
                value = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(valueType))](expression.value);
            }

            if (value !== undefined) {
                if (context['$urlParams']) { context['$urlParams'] += '&'; } else { context['$urlParams'] = ''; }
                context['$urlParams'] += expression.name + '=' + value;
            }
        } else {
            context.postData = context.postData || {};
            context.postData[expression.name] = expression.value;
        }
    },
//    VisitConstantExpression: function (expression, context) {
//        if (context['$urlParams']) { context['$urlParams'] += '&'; } else { context['$urlParams'] = ''; }
//
//
//        var valueType = Container.getTypeName(expression.value);
//
//
//
//        context['$urlParams'] += expression.name + '=' + this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(valueType))](expression.value);
//    },


    VisitCountExpression: function (expression, context) {
        this.Visit(expression.source, context);
        context.urlText += '/$count';       
    }
}, {});$C('$data.storageProviders.oData.oDataWhereCompiler', $data.Expressions.EntityExpressionVisitor, null, {
    constructor: function (provider, lambdaPrefix) {
        this.provider = provider;
        this.lambdaPrefix = lambdaPrefix;
    },

    compile: function (expression, context) {
        this.Visit(expression, context);
    },

    VisitParametricQueryExpression: function (expression, context) {
        this.Visit(expression.expression, context);
    },

    VisitUnaryExpression: function (expression, context) {
        context.data += expression.resolution.mapTo;
        context.data += "(";
        this.Visit(expression.operand, context);
        context.data += ")";
    },


    VisitSimpleBinaryExpression: function (expression, context) {
        context.data += "(";
        //TODO refactor!!!
        if (expression.nodeType == "in") {
            Guard.requireType("expression.right", expression.type, $data.Expressions.ConstantExpression);
            var paramValue = expression.right.value;
            if (!paramValue instanceof Array) { Guard.raise(new Exception("Right to the 'in' operator must be an array value")); }
            var result = null;
            var orResolution = { mapTo: "or", dataType: "boolean", name: "or" };
            var eqResolution = { mapTo: "eq", dataType: "boolean", name: "equal" };

            paramValue.forEach(function (item) {
                var idValue = Container.createConstantExpression(item);
                var idCheck = Container.createSimpleBinaryExpression(expression.left, idValue,
                    $data.Expressions.ExpressionType.Equal, "==", "boolean", eqResolution);
                if (result) {
                    result = Container.createSimpleBinaryExpression(result, idCheck,
                    $data.Expressions.ExpressionType.Or, "||", "boolean", orResolution);
                } else {
                    result = idCheck;
                };
            });
            var temp = context.data;
            context.data = '';
            this.Visit(result, context);
            context.data = temp + context.data.replace(/\(/g, '').replace(/\)/g, '');
        } else {
            this.Visit(expression.left, context);

            //REFACTOR
            if (expression.right instanceof $data.Expressions.EntityFieldOperationExpression && expression.right.operation.memberDefinition &&
                expression.right.operation.memberDefinition.fixedDataType === 'decimal' && context.data.substring(context.data.length - 1) === 'm') {
                context.data = context.data.substring(0, context.data.length - 1);
            }

            context.data += " ";
            context.data += expression.resolution.mapTo;
            context.data += " ";
            this.Visit(expression.right, context);

            //REFACTOR
            if (expression.left instanceof $data.Expressions.EntityFieldOperationExpression && expression.left.operation.memberDefinition &&
                expression.left.operation.memberDefinition.fixedDataType === 'decimal' && context.data.substring(context.data.length-1) === 'm') {
                context.data = context.data.substring(0, context.data.length - 1);
            }
        };
        context.data += ")";

    },

    VisitEntityFieldExpression: function (expression, context) {
        this.Visit(expression.source, context);
        if (expression.source instanceof $data.Expressions.ComplexTypeExpression) {
            context.data += "/";
        }
        this.Visit(expression.selector, context);
    },

    VisitAssociationInfoExpression: function (expression, context) {
        context.data += expression.associationInfo.FromPropertyName;
    },

    VisitMemberInfoExpression: function (expression, context) {
        context.data += expression.memberName;
    },

    VisitQueryParameterExpression: function (expression, context) {
        context.data += this.provider.fieldConverter.toDb[expression.type](expression.value);
    },

    VisitEntityFieldOperationExpression: function (expression, context) {
        Guard.requireType("expression.operation", expression.operation, $data.Expressions.MemberInfoExpression);

        //TODO refactor!
        var opDef = expression.operation.memberDefinition;
        var opName = opDef.mapTo || opDef.name;
        context.data += opName;
        context.data += "(";
        var paramCounter = 0;
        var params = opDef.parameters || [{ name: "@expression" }];

        var args = params.map(function (item, index) {
            if (item.name === "@expression") {
                return expression.source;
            } else {
                return expression.parameters[paramCounter++]
            };
        });

        args.forEach(function (arg, index) {
            if (index > 0) {
                context.data += ",";
            };
            this.Visit(arg, context);
        }, this);
        context.data += ")";
    },
    VisitEntityFunctionOperationExpression: function (expression, context) {
        Guard.requireType("expression.operation", expression.operation, $data.Expressions.MemberInfoExpression);
        this.Visit(expression.source, context);

        //TODO refactor!
        var opDef = expression.operation.memberDefinition;
        var opName = opDef.mapTo || opDef.name;
        context.data += opName;
        context.data += "(";
        var paramCounter = 0;
        var params = opDef.method.params || [{ name: "@expression" }];

        var exprParams = [];
        var definedParams = expression.operation.memberDefinition.method.params;
        if (expression.parameters && expression.parameters[0] &&
            expression.parameters[0].value && typeof expression.parameters[0].value === 'object' && definedParams && definedParams[0] &&
            (Container.resolveType(definedParams[0].type) !== $data.Object || definedParams[0].name in expression.parameters[0].value)) {

            if (expression.parameters[0] instanceof $data.Expressions.ObjectLiteralExpression) {
                exprParams = expression.parameters[0].members.map(function (ofe) { return ofe.expression });
                params = expression.parameters[0].members.map(function (ofe) { return { name: ofe.fieldName } });
            } else if (expression.parameters[0] instanceof $data.Expressions.ConstantExpression) {
                params.forEach(function (p) {
                    exprParams.push(Container.createConstantExpression(expression.parameters[0].value[p.name], Container.resolveType(p.type), p.name));
                });
            }
        } else {
            exprParams = expression.parameters;
        }

        var args = params.map(function (item, index) {
            if (item.name === "@expression") {
                return expression.source;
            } else {
                return exprParams[paramCounter++]
            };
        });

        args.forEach(function (arg, index) {
            if (arg === undefined || (arg instanceof $data.Expressions.ConstantExpression && typeof arg.value === 'undefined'))
                return;

            if (index > 0) {
                context.data += ",";
            };
            context.data += params[index].name + '=';
            this.Visit(arg, context);
        }, this);
        context.data += ")";
    },
    VisitContextFunctionOperationExpression: function (expression, context) {
        return this.VisitEntityFunctionOperationExpression(expression, context);
    },

    VisitConstantExpression: function (expression, context) {
        var valueType = Container.getTypeName(expression.value);
        context.data += this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(valueType))](expression.value);
    },

    VisitEntityExpression: function (expression, context) {
        this.Visit(expression.source, context);

        if (this.lambdaPrefix && expression.selector.lambda) {
            context.lambda = expression.selector.lambda;
            context.data += (expression.selector.lambda + '/');
        }

        //if (expression.selector instanceof $data.Expressions.EntityExpression) {
        //    this.Visit(expression.selector, context);
        //}
    },

    VisitEntitySetExpression: function (expression, context) {
        this.Visit(expression.source, context);
        if (expression.selector instanceof $data.Expressions.AssociationInfoExpression) {
            this.Visit(expression.selector, context);
            context.data += "/";
        }
    },

    VisitFrameOperationExpression: function (expression, context) {
        this.Visit(expression.source, context);

        Guard.requireType("expression.operation", expression.operation, $data.Expressions.MemberInfoExpression);

        //TODO refactor!
        var opDef = expression.operation.memberDefinition;
        var opName = opDef.mapTo || opDef.name;
        context.data += opName;
        context.data += "(";
        var paramCounter = 0;
        var params = opDef.parameters || [{ name: "@expression" }];

        var args = params.map(function (item, index) {
            if (item.name === "@expression") {
                return expression.source;
            } else {
                return expression.parameters[paramCounter++]
            };
        });

        for (var i = 0; i < args.length; i++) {
            var arg = args[i];
            if (arg && arg.value instanceof $data.Queryable) {
                var frameExpression = new opDef.frameType(arg.value.expression);
                var preparator = Container.createQueryExpressionCreator(arg.value.entityContext);
                var prep_expression = preparator.Visit(frameExpression);

                var compiler = new $data.storageProviders.oData.oDataWhereCompiler(this.provider, true);
                var frameContext = { data: "" };
                var compiled = compiler.compile(prep_expression, frameContext);

                context.data += (frameContext.lambda + ': ' + frameContext.data);
            };
        }
        context.data += ")";
    }
});$C('$data.storageProviders.oData.oDataOrderCompiler', $data.storageProviders.oData.oDataWhereCompiler, null, {
    constructor: function (provider) {
        this.provider = provider;
    },

    compile: function (expression, context) {
        this.Visit(expression, context);
    },
    VisitOrderExpression: function (expression, context) {
        var orderContext = { data: "" };
        this.Visit(expression.selector, orderContext);
        if (context['$orderby']) { context['$orderby'] += ','; } else { context['$orderby'] = ''; }
        context['$orderby'] += orderContext.data
                           + (expression.nodeType == $data.Expressions.ExpressionType.OrderByDescending ? " desc" : "");
    },
    VisitParametricQueryExpression: function (expression, context) {
        this.Visit(expression.expression, context);
    },
    VisitEntityFieldExpression: function (expression, context) {
        this.Visit(expression.source, context);
        this.Visit(expression.selector, context);
    },
    VisitComplexTypeExpression: function (expression, context) {
        this.Visit(expression.source, context);
        this.Visit(expression.selector, context);
        context.data += "/";
    },
    VisitEntitySetExpression: function (expression, context) {
        if (expression.selector instanceof $data.Expressions.AssociationInfoExpression) {
            this.Visit(expression.source, context);
            this.Visit(expression.selector, context);
        }
    },
    VisitAssociationInfoExpression: function (expression, context) {
        context.data += expression.associationInfo.FromPropertyName + '/';
    },
    VisitEntityExpression: function (expression, context) {
        this.Visit(expression.source, context);
        this.Visit(expression.selector, context);
    },
    VisitMemberInfoExpression: function (expression, context) {
        context.data += expression.memberName;
    },
    VisitEntityFieldOperationExpression: function (expression, context) {
        Guard.requireType("expression.operation", expression.operation, $data.Expressions.MemberInfoExpression);

        //TODO refactor!
        var opDef = expression.operation.memberDefinition;
        var opName = opDef.mapTo || opDef.name;
        context.data += opName;
        context.data += "(";
        var paramCounter = 0;
        var params = opDef.parameters || [{ name: "@expression" }];

        var args = params.map(function (item, index) {
            if (item.name === "@expression") {
                return expression.source;
            } else {
                return expression.parameters[paramCounter++]
            };
        });

        args.forEach(function (arg, index) {
            if (index > 0) {
                context.data += ",";
            };
            this.Visit(arg, context);
        }, this);
        context.data += ")";
    },
    VisitEntityFunctionOperationExpression: function (expression, context) {
        Guard.requireType("expression.operation", expression.operation, $data.Expressions.MemberInfoExpression);
        this.Visit(expression.source, context);

        //TODO refactor!
        var opDef = expression.operation.memberDefinition;
        var opName = opDef.mapTo || opDef.name;
        context.data += opName;
        context.data += "(";
        var paramCounter = 0;
        var params = opDef.method.params || [{ name: "@expression" }];

        var exprParams = [];
        var definedParams = expression.operation.memberDefinition.method.params;
        if (expression.parameters && expression.parameters[0] &&
            expression.parameters[0].value && typeof expression.parameters[0].value === 'object' && definedParams && definedParams[0] &&
            (Container.resolveType(definedParams[0].type) !== $data.Object || definedParams[0].name in expression.parameters[0].value)) {

            if (expression.parameters[0] instanceof $data.Expressions.ObjectLiteralExpression) {
                exprParams = expression.parameters[0].members.map(function (ofe) { return ofe.expression });
                params = expression.parameters[0].members.map(function (ofe) { return { name: ofe.fieldName } });
            } else if (expression.parameters[0] instanceof $data.Expressions.ConstantExpression) {
                params.forEach(function (p) {
                    exprParams.push(Container.createConstantExpression(expression.parameters[0].value[p.name], Container.resolveType(p.type), p.name));
                });
            }
        } else {
            exprParams = expression.parameters;
        }

        var args = params.map(function (item, index) {
            if (item.name === "@expression") {
                return expression.source;
            } else {
                return exprParams[paramCounter++]
            };
        });

        args.forEach(function (arg, index) {
            if (arg === undefined || (arg instanceof $data.Expressions.ConstantExpression && typeof arg.value === 'undefined'))
                return;

            if (index > 0) {
                context.data += ",";
            };
            context.data += params[index].name + '=';
            this.Visit(arg, context);
        }, this);
        context.data += ")";
    },
    VisitContextFunctionOperationExpression: function (expression, context) {
        return this.VisitEntityFunctionOperationExpression(expression, context);
    }
});
$C('$data.storageProviders.oData.oDataPagingCompiler', $data.Expressions.EntityExpressionVisitor, null, {
    constructor: function (provider) {
        this.provider = provider;
    },

    compile: function (expression, context) {
        this.Visit(expression, context);
    },
    VisitPagingExpression: function (expression, context) {
        var pagingContext = { data: "" };
        this.Visit(expression.amount, pagingContext);
        switch (expression.nodeType) {
            case $data.Expressions.ExpressionType.Skip: context['$skip'] = pagingContext.data; break;
            case $data.Expressions.ExpressionType.Take: context['$top'] = pagingContext.data; break;
            default: Guard.raise("Not supported nodeType"); break;
        }
    },
    VisitConstantExpression: function (expression, context) {
        context.data += expression.value;
    }
});
$C('$data.storageProviders.oData.oDataProjectionCompiler', $data.Expressions.EntityExpressionVisitor, null, {
    constructor: function (entityContext) {
        this.entityContext = entityContext;
        this.hasObjectLiteral = false;
        this.ObjectLiteralPath = "";
        this.modelBinderMapping = [];
    },

    compile: function (expression, context) {
        this.Visit(expression, context);
    },
    VisitProjectionExpression: function (expression, context) {
        ///<summary></summary>
        ///<param name="expression" type="$data.Expressions.ProjectionExpression" mayBeNull="false"></param>
        ///<param name="context" mayBeNull="false"></param>
        context.data = "";
        this.mapping = "";

        this.Visit(expression.selector, context);
        if (context['$select']) { context['$select'] += ','; } else { context['$select'] = ''; }
        context["$select"] += context.data;
        context.data = "";
    },
    VisitParametricQueryExpression: function (expression, context) {
        this.Visit(expression.expression, context);
        if (expression.expression instanceof $data.Expressions.EntityExpression || expression.expression instanceof $data.Expressions.EntitySetExpression) {
            if (context['$expand']) { context['$expand'] += ','; } else { context['$expand'] = ''; }
            context['$expand'] += this.mapping.replace(/\./g, '/')
        } if (expression.expression instanceof $data.Expressions.ComplexTypeExpression) {
            var m = this.mapping.split('.');
            m.pop();
            if (m.length > 0) {
                if (context['$expand']) { context['$expand'] += ','; } else { context['$expand'] = ''; }
                context['$expand'] += m.join('/');
            }
        } else {
            var m = this.mapping.split('.');
            m.pop();
            if (m.length > 0) {
                if (context['$expand']) { context['$expand'] += ','; } else { context['$expand'] = ''; }
                context['$expand'] += m.join('/');
            }
        }
    },
    VisitObjectLiteralExpression: function (expression, context) {
        ///<summary></summary>
        ///<param name="expression" type="$data.Expressions.ObjectLiteralExpression" mayBeNull="false"></param>
        ///<param name="context" mayBeNull="false"></param>
        var tempObjectLiteralPath = this.ObjectLiteralPath;
        this.hasObjectLiteral = true;
        expression.members.forEach(function (member, index) {
            this.Visit(member, context);
            if (index < expression.members.length - 1) { context.data += ','; }
            this.mapping = '';
        }, this);
        this.ObjectLiteralPath = tempObjectLiteralPath;
    },
    VisitObjectFieldExpression: function (expression, context) {


        if (this.ObjectLiteralPath) { this.ObjectLiteralPath += '.' + expression.fieldName; } else { this.ObjectLiteralPath = expression.fieldName; }
        this.Visit(expression.expression, context);

        if (expression.expression instanceof $data.Expressions.EntityExpression || expression.expression instanceof $data.Expressions.EntitySetExpression) {
            if (context['$expand']) { context['$expand'] += ','; } else { context['$expand'] = ''; }
            context['$expand'] += this.mapping.replace(/\./g, '/')
        } else {
            var m = this.mapping.split('.');
            m.pop();
            if (m.length > 0) {
                if (context['$expand']) { context['$expand'] += ','; } else { context['$expand'] = ''; }
                context['$expand'] += m.join('/');
            }
        }
    },

    VisitComplexTypeExpression: function (expression, context) {
        this.Visit(expression.source, context);
        this.Visit(expression.selector, context);
    },
    
    VisitEntityFieldExpression: function (expression, context) {
        this.Visit(expression.source, context);
        this.Visit(expression.selector, context);
    },
    VisitEntityExpression: function (expression, context) {
        ///<summary></summary>
        ///<param name="expression" type="$data.Expressions.EntityExpression" mayBeNull="false"></param>
        ///<param name="context" mayBeNull="false"></param>
        this.Visit(expression.source, context);
    },
    VisitEntitySetExpression: function (expression, context) {
        ///<summary></summary>
        ///<param name="expression" type="$data.Expressions.EntitySetExpression" mayBeNull="false"></param>
        ///<param name="context" mayBeNull="false"></param>
        if (expression.source instanceof $data.Expressions.EntityExpression) {
            this.Visit(expression.source, context);
        }
        if (expression.selector instanceof $data.Expressions.AssociationInfoExpression) {
            this.Visit(expression.selector, context);
        }
    },
    VisitAssociationInfoExpression: function (expression, context) {
        if (context.data && context.data.length > 0 && context.data[context.data.length - 1] != ',') { context.data += '/'; }
        context.data += expression.associationInfo.FromPropertyName;
        if (this.mapping && this.mapping.length > 0) { this.mapping += '.'; }
        this.mapping += expression.associationInfo.FromPropertyName;
    },
    VisitMemberInfoExpression: function (expression, context) {
        if (context.data && context.data.length > 0 && context.data[context.data.length - 1] != ',') { context.data += '/'; }
        context.data += expression.memberName;
        if (this.mapping && this.mapping.length > 0) { this.mapping += '.'; }
        this.mapping += expression.memberName;
    },
    VisitConstantExpression: function (expression, context) {
        //Guard.raise(new Exception('Constant value is not supported in Projection.', 'Not supported!'));
        //context.data += expression.value;
		context.data = context.data.slice(0, context.data.length - 1);
    }
});