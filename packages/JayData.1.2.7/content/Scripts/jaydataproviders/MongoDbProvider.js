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
$C('$data.modelBinder.mongoDBModelBinderConfigCompiler', $data.modelBinder.ModelBinderConfigCompiler, null, {
    _addPropertyToModelBinderConfig: function (elementType, builder) {
        var storageModel = this._query.context._storageModel.getStorageModel(elementType);
        if (elementType.memberDefinitions) {
            elementType.memberDefinitions.getPublicMappedProperties().forEach(function (prop) {
                if ((!storageModel) || (storageModel && !storageModel.Associations[prop.name] && !storageModel.ComplexTypes[prop.name])) {

                    if (!storageModel && this._query.context.storageProvider.supportedDataTypes.indexOf(Container.resolveType(prop.dataType)) < 0) {
                        //complex type
                        builder.selectModelBinderProperty(prop.name);
                        builder.modelBinderConfig['$type'] = Container.resolveType(prop.dataType);
                        
                        if (this._isoDataProvider) {
                            builder.modelBinderConfig['$selector'] = ['json:' + prop.name + '.results', 'json:' + prop.name];
                        } else {
                            builder.modelBinderConfig['$selector'] = 'json:' + prop.name;
                        }
                        this._addPropertyToModelBinderConfig(Container.resolveType(prop.dataType), builder);
                        builder.popModelBinderProperty();
                    } else {
                        if (prop.key) {
                            builder.addKeyField(prop.computed ? '_id' : prop.name);
                        }
                        if (prop.concurrencyMode === $data.ConcurrencyMode.Fixed) {
                            builder.modelBinderConfig[prop.name] = { $selector: 'json:__metadata', $source: 'etag' }
                        } else {
                            var dt = Container.resolveType(prop.dataType);
                            if (dt === $data.Array || dt === $data.Object){
                                builder.modelBinderConfig[prop.name] = {
                                    $type: dt,
                                    $source: prop.name
                                };
                            }else builder.modelBinderConfig[prop.name] = prop.computed ? '_id' : prop.name;
                        }
                    }
                }
            }, this);
        } else {
            builder._binderConfig.$item = builder._binderConfig.$item || {};
            builder.modelBinderConfig = builder._binderConfig.$item;
        }
        if (storageModel) {
            this._addComplexTypeProperties(storageModel.ComplexTypes, builder);
        }
    },
    _addComplexType: function(ct, builder){
        if (ct.ToType !== $data.Array){
            builder.modelBinderConfig['$type'] = ct.ToType;
            if (this._isoDataProvider) {
                builder.modelBinderConfig['$selector'] = ['json:' + ct.FromPropertyName + '.results', 'json:' + ct.FromPropertyName];
            } else {
                builder.modelBinderConfig['$selector'] = 'json:' + ct.FromPropertyName;
            }
            this._addPropertyToModelBinderConfig(ct.ToType, builder);
        }else{
            var dt = ct.ToType;
            var et = Container.resolveType(ct.FromType.memberDefinitions.getMember(ct.FromPropertyName).elementType);
            if (dt === $data.Array && et && et.isAssignableTo && et.isAssignableTo($data.Entity)){
                config = {
                    $type: $data.Array,
                    $selector: 'json:' + ct.FromPropertyName,
                    $item: {
                        $type: et
                    }
                };
                var md = et.memberDefinitions.getPublicMappedProperties();
                for (var i = 0; i < md.length; i++){
                    config.$item[md[i].name] = { $type: md[i].type, $source: md[i].name };
                }
                $data.typeSystem.extend(builder.modelBinderConfig, config);
                //builder.modelBinderConfig[ct.FromPropertyName] = config;
            }else{
                /*builder.modelBinderConfig[ct.FromPropertyName] = {};
                builder.modelBinderConfig[ct.FromPropertyName].$type = ct.ToType;
                builder.modelBinderConfig[ct.FromPropertyName].$source = ct.FromPropertyName;*/
                if (dt === $data.Array && et === $data.ObjectID){
                    $data.typeSystem.extend(builder.modelBinderConfig, {
                        $type: $data.Array,
                        $selector: 'json:' + ct.FromPropertyName,
                        $item: {
                            $type: $data.ObjectID,
                            $value: function(meta, data){
                                var type = Container.resolveName(meta.$type);
                                var converter = this.context.storageProvider.fieldConverter.fromDb;
                                var converterFn = converter ? converter[type] : undefined;
                                
                                return converter && converter[type] ? converter[type](data) : new (Container.resolveType(type))(data);
                            }
                        }
                    });
                }else{
                    $data.typeSystem.extend(builder.modelBinderConfig, {
                        $type: ct.ToType,
                        $source: ct.FromPropertyName
                    });
                }
            }
        }
    },
    _addComplexTypeProperties: function (complexTypes, builder) {
        var self = this;
        complexTypes.forEach(function (ct) {
            builder.selectModelBinderProperty(ct.FromPropertyName);
            self._addComplexType(ct, builder);
            builder.popModelBinderProperty();
        }, this);
    },
    VisitComplexTypeExpression: function (expression, builder) {
        this.Visit(expression.source, builder);
        this.Visit(expression.selector, builder);
        
        if (('$selector' in builder.modelBinderConfig) && (builder.modelBinderConfig.$selector.length > 0)) {
            if (builder.modelBinderConfig.$selector instanceof $data.Array) {
                var temp = builder.modelBinderConfig.$selector[1];
                builder.modelBinderConfig.$selector[0] = temp + '.' + expression.selector.memberName + '.results';
                builder.modelBinderConfig.$selector[1] = temp + '.' + expression.selector.memberName;
            } else {
                var type = Container.resolveType(expression.selector.memberDefinition.type);
                var elementType = type === $data.Array && expression.selector.memberDefinition.elementType ? Container.resolveType(expression.selector.memberDefinition.elementType) : type;
                if (elementType.memberDefinitions.getMember(expression.selector.memberName))
                    builder.modelBinderConfig.$selector += '.' + expression.selector.memberName;
            }

        } else {
            //builder.modelBinderConfig['$selector'] = 'json:' + expression.selector.memberName;
            var type = Container.resolveType(expression.selector.memberDefinition.type);
            var elementType = type === $data.Array && expression.selector.memberDefinition.elementType ? Container.resolveType(expression.selector.memberDefinition.elementType) : undefined;
            if (type === $data.Array && elementType && elementType.isAssignableTo && elementType.isAssignableTo($data.Entity)){
                this._addComplexType(expression.selector.memberDefinition.storageModel.ComplexTypes[expression.selector.memberDefinition.name], builder);
            }else{
                //builder.modelBinderConfig.$type = Container.resolveType(expression.selector.memberDefinition.type);
                builder.modelBinderConfig.$source = expression.selector.memberName;
                
                if (type !== $data.Array){// && (type.isAssignableTo ? !type.isAssignableTo($data.Entity) : true)){
                    builder.modelBinderConfig.$selector = 'json:' + expression.selector.memberDefinition.name;
                }
                
                if (builder._binderConfig.$item === builder.modelBinderConfig &&
                    expression.selector.memberDefinition.storageModel &&
                    expression.selector.memberDefinition.storageModel.ComplexTypes[expression.selector.memberDefinition.name]){
                    builder.modelBinderConfig.$selectorMemberInfo = builder.modelBinderConfig.$selector;
                    delete builder.modelBinderConfig.$selector;
                }
            }
        }
    },
    VisitMemberInfoExpression: function (expression, builder) {
        var type = Container.resolveType(expression.memberDefinition.type);
        var elementType = type === $data.Array && expression.memberDefinition.elementType ? Container.resolveType(expression.memberDefinition.elementType) : undefined;
        builder.modelBinderConfig['$type'] = type;
        
        if (type === $data.Array && elementType && elementType.isAssignableTo && elementType.isAssignableTo($data.Entity)){
            this._addComplexType(expression.memberDefinition.storageModel.ComplexTypes[expression.memberName], builder);
        }else{
            if (expression.memberDefinition.storageModel && expression.memberName in expression.memberDefinition.storageModel.ComplexTypes) {
                this._addPropertyToModelBinderConfig(Container.resolveType(expression.memberDefinition.type), builder);
            } else {
                if (builder._binderConfig.$item === builder.modelBinderConfig){
                    builder._binderConfig.$item = {
                        $type: builder.modelBinderConfig.$type,
                        $selector: builder.modelBinderConfig.$selectorMemberInfo,
                        $source: expression.memberDefinition.computed ? '_id' : expression.memberName
                    };
                }else{
                    builder.modelBinderConfig['$source'] = expression.memberDefinition.computed ? '_id' : expression.memberName;
                }
            }
        }
    }
});

$C('$data.storageProviders.mongoDB.mongoDBProjectionCompiler', $data.Expressions.EntityExpressionVisitor, null, {
    constructor: function () {
    },

    compile: function (expression, context) {
        //console.log(JSON.stringify(expression, null, '    '));
        this.Visit(expression, context);
        delete context.current;
        delete context.complexType;
    },
    VisitProjectionExpression: function (expression, context) {
        this.Visit(expression.selector, context);
    },
    VisitParametricQueryExpression: function (expression, context) {
        this.Visit(expression.expression, context);
    },
    VisitObjectLiteralExpression: function (expression, context) {
        var tempObjectLiteralPath = this.ObjectLiteralPath;
        this.hasObjectLiteral = true;
        expression.members.forEach(function (member, index) {
            this.Visit(member, context);
        }, this);
    },
    VisitObjectFieldExpression: function (expression, context) {
        this.Visit(expression.expression, context);
    },

    VisitComplexTypeExpression: function (expression, context) {
        this.Visit(expression.source, context);
        this.Visit(expression.selector, context);
        //context.complexType = context.current;
    },
    
    VisitEntityFieldExpression: function (expression, context) {
        this.Visit(expression.source, context);
        this.Visit(expression.selector, context);
    },
    VisitEntityExpression: function (expression, context) {
        this.Visit(expression.source, context);
    },
    VisitEntitySetExpression: function (expression, context) {
        if (expression.source instanceof $data.Expressions.EntityExpression) {
            this.Visit(expression.source, context);
        }
        if (expression.selector instanceof $data.Expressions.AssociationInfoExpression) {
            this.Visit(expression.selector, context);
        }
    },
    VisitAssociationInfoExpression: function (expression, context) {
    },
    VisitMemberInfoExpression: function (expression, context) {
        if (!context.options.fields) context.options.fields = { _id: 1 };
        context.current = expression.memberName;
        if (context.complexType){
            delete context.options.fields[context.complexType];
            //if (typeof context.options.fields[context.complexType] !== 'object') context.options.fields[context.complexType] = {};
            context.options.fields[context.complexType + '.' + context.current] = 1;
            delete context.complexType;
        }else if (!context.options.fields[expression.memberName]) context.options.fields[expression.memberName] = 1;
        //console.log('complexType =>', context.current, context.complexType);
    },
    VisitConstantExpression: function (expression, context) {
    }
});

$C('$data.storageProviders.mongoDB.mongoDBWhereCompiler', $data.Expressions.EntityExpressionVisitor, null, {
    constructor: function (provider, lambdaPrefix) {
        this.provider = provider;
        this.lambdaPrefix = lambdaPrefix;
    },

    compile: function (expression, context) {
        if (!context.cursor) {
            context.query = {};
            context.cursor = context.query;
        }
        this.Visit(expression, context);
    },

    VisitParametricQueryExpression: function (expression, context) {
        this.Visit(expression.expression, context);
        if (expression.expression && expression.expression.nodeType === $data.Expressions.ExpressionType.Constant){
            context.value = expression.expression.value;
            context.queryField = context.field = $data.Guid.NewGuid();
            if (context.value === true) context.value = null;
            
            if (context.cursor instanceof Array){
                var o = {};
                o[context.queryField] = context.value;
                context.cursor.push(o);
            }else context.cursor[context.queryField] = context.value;
        }
    },

    VisitUnaryExpression: function (expression, context) {
        context.unary = expression.nodeType;
        this.Visit(expression.operand, context);
    },
    
    _constExpressionFilter: function(expression, context){
        if (expression.left && expression.left.nodeType === $data.Expressions.ExpressionType.Constant && expression.right && [$data.Expressions.ExpressionType.Or, $data.Expressions.ExpressionType.And].indexOf(expression.nodeType) >= 0){
            context.value = expression.left.value;
            context.queryField = context.field = $data.Guid.NewGuid();
            if (context.value === true) context.value = null;
            
            if (context.cursor instanceof Array){
                var o = {};
                o[context.queryField] = context.value;
                context.cursor.push(o);
            }else context.cursor[context.queryField] = context.value;
        }
    },

    VisitSimpleBinaryExpression: function (expression, context) {
     
        var cursor = context.cursor;
        
        switch (expression.nodeType){
            case $data.Expressions.ExpressionType.Or:
                if (context.cursor instanceof Array){
                    var or = { $or: [] };
                    context.cursor.push(or);
                    context.cursor = or.$or;
                }else{
                    context.cursor.$or = [];
                    context.cursor = context.cursor.$or;
                }
                this.Visit(expression.left, context);
                this.Visit(expression.right, context);
                this._constExpressionFilter(expression, context);
                
                context.cursor = cursor;
                break;
            case $data.Expressions.ExpressionType.And:
                if (context.cursor instanceof Array){
                    var and = { $and: [] };
                    context.cursor.push(and);
                    context.cursor = and.$and;
                }else{
                    context.cursor.$and = [];
                    context.cursor = context.cursor.$and;
                }
                this.Visit(expression.left, context);
                this.Visit(expression.right, context);
                this._constExpressionFilter(expression, context);
                
                context.cursor = cursor;
                break;
            case $data.Expressions.ExpressionType.Equal:
            case $data.Expressions.ExpressionType.EqualTyped:
                this.Visit(expression.left, context);
                this.Visit(expression.right, context);
                context.queryField = context.field;
                if (!context.complexType && context.entityType && context.entityType.memberDefinitions.getMember(context.field).computed){
                    delete context.query[context.field];
                    context.queryField = '_id';
                }
                var v = context.value;
                if (context.entityType && context.entityType.memberDefinitions)
                    v = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(context.entityType.memberDefinitions.getMember(context.complexType ? context.lastField : context.field).type))](v);
                else if (context.valueType)
                    v = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(context.valueType))](v);
                context.value = v;
                if (context.cursor instanceof Array){
                    var o = {};
                    o[context.queryField] = context.value;
                    context.cursor.push(o);
                }else context.cursor[context.queryField] = context.value;
                break;
            case $data.Expressions.ExpressionType.In:
                this.Visit(expression.left, context);
                this.Visit(expression.right, context);
                context.queryField = context.field;
                if (!context.complexType && context.entityType && context.entityType.memberDefinitions.getMember(context.field).computed){
                    delete context.query[context.field];
                    context.queryField = '_id';
                }
                var v = context.value;
                if (v instanceof Array){
                    for (var i = 0; i < v.length; i++){
                        if (context.entityType && context.entityType.memberDefinitions)
                            v[i] = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(context.entityType.memberDefinitions.getMember(context.complexType ? context.lastField : context.field).type))](v[i]);
                        else if (context.valueType)
                            v[i] = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(context.valueType))](v[i]);
                    }
                }
                context.value = v;
                if (context.cursor instanceof Array){
                    var o = {};
                    o[context.queryField] = {};
                    if (context.entityType && context.entityType === $data.Array){
                        o[context.queryField] = context.unary === $data.Expressions.ExpressionType.Not ? { $not: context.value } : context.value;
                    }else{
                        o[context.queryField][context.unary === $data.Expressions.ExpressionType.Not ? '$nin' : expression.resolution.mapTo] = context.value;
                    }
                    context.cursor.push(o);
                }else{
                    context.cursor[context.queryField] = {};
                    if (context.entityType && context.entityType === $data.Array){
                        context.cursor[context.queryField] = context.unary === $data.Expressions.ExpressionType.Not ? { $not: context.value } : context.value;
                    }else{
                        context.cursor[context.queryField][context.unary === $data.Expressions.ExpressionType.Not ? '$nin' : expression.resolution.mapTo] = context.value;
                    }
                    //context.cursor[context.queryField][context.unary === $data.Expressions.ExpressionType.Not ? '$nin' : expression.resolution.mapTo] = context.value;
                }
                if (context.unary === $data.Expressions.ExpressionType.Not) context.unary = undefined;
                break;
            default:
                this.Visit(expression.left, context);
                this.Visit(expression.right, context);
                context.queryField = context.field;
                if (!context.complexType && context.entityType && context.entityType.memberDefinitions.getMember(context.field).computed){
                    delete context.query[context.field];
                    context.queryField = '_id';
                }
                var v = context.value;
                if (context.entityType && context.entityType.memberDefinitions)
                    v = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(context.entityType.memberDefinitions.getMember(context.complexType ? context.lastField : context.field).type))](v);
                else if (context.valueType)
                    v = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(context.valueType))](v);
                context.value = v;
                if (context.cursor instanceof Array){
                    var o = {};
                    o[context.queryField] = {};
                    o[context.queryField][expression.resolution.mapTo] = context.value;
                    context.cursor.push(o);
                }else{
                    context.cursor[context.queryField] = {};
                    context.cursor[context.queryField][expression.resolution.mapTo] = context.value;
                }
                break;
        }
        
        delete context.complexType;
        delete context.field;
        delete context.value;
        
        /*if (expression.nodeType == $data.Expressions.ExpressionType.Or) context.or = true;
        else if (expression.nodeType == $data.Expressions.ExpressionType.And) context.and = true;
        
        this.Visit(expression.left, context);
        this.Visit(expression.right, context);
        
        if (expression.nodeType == $data.Expressions.ExpressionType.Or && context.stackOr && context.stackOr.length){
            var or = [];
            while (context.stackOr.length){
                var field = context.stackOr.pop();
                var expr = {};
                
                expr[field.field] = field.query;
                or.push(expr);
                delete context.query[field.field];
            }
            if (or.length == 1){
                if (context.and){
                    if (!context.stackAnd) context.stackAnd = [];
                    context.stackAnd.push({ field: '$or', query: [or[0]] });
                }else context.query = or[0];
            }else{
                if (context.and){
                    if (!context.stackAnd) context.stackAnd = [];
                    context.stackAnd.push({ field: '$or', query: or });
                }else context.query.$or = or;
            }
            context.or = false;
        }else if (expression.nodeType == $data.Expressions.ExpressionType.And && context.stackAnd && context.stackAnd.length){
            var and = [];
            while (context.stackAnd.length){
                var field = context.stackAnd.pop();
                var expr = {};
                
                expr[field.field] = field.query;
                and.push(expr);
                delete context.query[field.field];
            }
            if (and.length == 1){
                if (context.or){
                    if (!context.stackOr) context.stackOr = [];
                    context.stackOr.push({ field: '$and', query: [and[0]] });
                }else context.query = and[0];
            }else{
                if (context.or){
                    if (!context.stackOr) context.stackOr = [];
                    context.stackOr.push({ field: '$and', query: and });
                }else context.query.$and = and;
            }
            context.and = false;
        }else if (expression.nodeType !== $data.Expressions.ExpressionType.And){
            if (expression.nodeType !== $data.Expressions.ExpressionType.Or){
                context.queryField = context.field;
                if (context.entityType && context.entityType.memberDefinitions.getMember(context.field).computed){
                    delete context.query[context.field];
                    context.queryField = '_id';
                }
            }
            if (expression.nodeType === $data.Expressions.ExpressionType.Equal || expression.nodeType === $data.Expressions.ExpressionType.EqualTyped){
                var v = context.value;
                if (context.entityType)
                    v = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(context.entityType.memberDefinitions.getMember(context.field).type))](v);
                else if (context.valueType)
                    v = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(valueType))](v);
                context.query[context.queryField] = v;
            }else if (expression.nodeType == $data.Expressions.ExpressionType.In){
                var v = context.value;
                if (v instanceof Array){
                    for (var i = 0; i < v.length; i++){
                        if (context.entityType)
                            v[i] = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(context.entityType.memberDefinitions.getMember(context.field).type))](v[i]);
                        else if (context.valueType)
                            v[i] = this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(valueType))](v[i]);
                    }
                }
                if (!context.query[context.queryField]) context.query[context.queryField] = {};
                if (context.unary == $data.Expressions.ExpressionType.Not){
                    context.query[context.queryField].$nin = v;
                    context.unary = undefined;
                }else{
                    context.query[context.queryField][expression.resolution.mapTo] = v;
                }
            }else{
                if (!context.query[context.queryField]) context.query[context.queryField] = {};
                context.query[context.queryField][expression.resolution.mapTo] = context.value;
            }
            
            if (context.or){
                if (!context.stackOr) context.stackOr = [];
                context.stackOr.push({ field: context.queryField, query: context.query[context.queryField] });
            }else if (context.and){
                if (!context.stackAnd) context.stackAnd = [];
                context.stackAnd.push({ field: context.queryField, query: context.query[context.queryField] });
            }
            
            context.field = undefined;
            context.value = undefined;
        }*/
    },

    VisitEntityFieldExpression: function (expression, context) {
        this.Visit(expression.source, context);
        this.Visit(expression.selector, context);
    },

    VisitAssociationInfoExpression: function (expression, context) {
        context.data += expression.associationInfo.FromPropertyName;
    },

    VisitMemberInfoExpression: function (expression, context) {
        //if (!context.query[expression.memberName]) context.query[expression.memberName] = null;
        context.field = context.complexType && context.field ? context.field + '.' + expression.memberName : expression.memberName;
        if (context.complexType) context.lastField = expression.memberName;
    },
    
    VisitComplexTypeExpression: function(expression, context){
        context.complexType = true;
        this.Visit(expression.source, context);
        this.Visit(expression.selector, context);
        context.entityType = expression.entityType;
        //delete context.complexType;
    },

    VisitQueryParameterExpression: function (expression, context) {
        context.data += this.provider.fieldConverter.toDb[expression.type](expression.value);
    },

    VisitEntityFieldOperationExpression: function (expression, context) {
        Guard.requireType("expression.operation", expression.operation, $data.Expressions.MemberInfoExpression);
        
        this.Visit(expression.source.selector, context);

        //TODO refactor!
        var opDef = expression.operation.memberDefinition;
        var opName = opDef.mapTo || opDef.name;
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
            this.Visit(arg, context);
        }, this);
        
        var opMapTo;
        var opValue;
        switch (opName){
            case 'contains':
                opMapTo = '$regex';
                opValue = context.value.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
                break;
            case 'startsWith':
                opMapTo = '$regex';
                opValue = '^' + context.value.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1");
                break;
            case 'endsWith':
                opMapTo = '$regex';
                opValue = context.value.replace(/([.?*+^$[\]\\(){}|-])/g, "\\$1") + '$';
                break;
            default:
                break;
        }
        
        if (context.unary === $data.Expressions.ExpressionType.Not){
            opValue = '^((?!' + opValue + ').)*$';
        }
        
        if (opMapTo && opValue){
            if (context.cursor instanceof Array){
                var o = {};
                o[context.field] = {};
                o[context.field][opMapTo] = opValue;
                context.cursor.push(o);
            }else{
                context.cursor[context.field] = {};
                context.cursor[context.field][opMapTo] = opValue;
            }
        }
    },

    VisitConstantExpression: function (expression, context) {
        var valueType = Container.getTypeName(expression.value);
        context.valueType = valueType;
        context.value = expression.value; //this.provider.fieldConverter.toDb[Container.resolveName(Container.resolveType(valueType))](expression.value);
    },

    VisitEntityExpression: function (expression, context) {
        context.entityType = expression.entityType;
        this.Visit(expression.source, context);
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
            if (arg.value instanceof $data.Queryable) {
                var frameExpression = new opDef.frameType(arg.value.expression);
                var preparator = new $data.Expressions.QueryExpressionCreator(arg.value.entityContext);
                var prep_expression = preparator.Visit(frameExpression);

                var compiler = new $data.storageProviders.mongoDB.mongoDBWhereCompiler(this.provider, true);
                var frameContext = { data: "" };
                var compiled = compiler.compile(prep_expression, frameContext);

                context.data += (frameContext.lambda + ': ' + frameContext.data);
            };
        }
        context.data += ")";
    }
});

$C('$data.storageProviders.mongoDB.mongoDBOrderCompiler', $data.storageProviders.mongoDB.mongoDBWhereCompiler, null, {
    constructor: function (provider) {
        this.provider = provider;
    },

    compile: function (expression, context) {
        this.Visit(expression, context);
    },
    VisitOrderExpression: function (expression, context) {
        var orderContext = { data: '' };
        this.Visit(expression.selector, orderContext);
        if (!context.options.sort) context.options.sort = {};
        context.options.sort[orderContext.data] = expression.nodeType == $data.Expressions.ExpressionType.OrderByDescending ? -1 : 1;
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
        if (context.data) context.data += '.';
        this.Visit(expression.selector, context);
    },
    VisitEntitySetExpression: function (expression, context) {
        if (expression.selector instanceof $data.Expressions.AssociationInfoExpression) {
            this.Visit(expression.source, context);
            this.Visit(expression.selector, context);
        }
    },
    VisitAssociationInfoExpression: function (expression, context) {
    },
    VisitEntityExpression: function (expression, context) {
        this.Visit(expression.source, context);
        this.Visit(expression.selector, context);
    },
    VisitMemberInfoExpression: function (expression, context) {
        if (context.data) context.data += '.';
        context.data += expression.memberDefinition.computed ? '_id' : expression.memberName;
    }
});

$C('$data.storageProviders.mongoDB.mongoDBPagingCompiler', $data.Expressions.EntityExpressionVisitor, null, {
    constructor: function (provider) {
        this.provider = provider;
    },

    compile: function (expression, context) {
        this.Visit(expression, context);
    },
    VisitPagingExpression: function (expression, context) {
        var pagingContext = { data: 0 };
        this.Visit(expression.amount, pagingContext);
        switch (expression.nodeType) {
            case $data.Expressions.ExpressionType.Skip: context.options.skip = pagingContext.data; break;
            case $data.Expressions.ExpressionType.Take: context.options.limit = pagingContext.data; break;
            default: Guard.raise("Not supported nodeType"); break;
        }
    },
    VisitConstantExpression: function (expression, context) {
        context.data += expression.value;
    }
});

$C('$data.storageProviders.mongoDB.mongoDBCompiler', $data.Expressions.EntityExpressionVisitor, null, {
    constructor: function(){
        this.context = {};
        this.provider = {};
        this.includes = null;
        this.mainEntitySet = null;
    },
    compile: function(query){
        this.provider = query.context.storageProvider;
        this.context = query.context;
        this.mainEntitySet = query.context.getEntitySetFromElementType(query.defaultType);

        query.find = {
            query: {},
            options: {}
        };
        
        query.modelBinderConfig = {};
        var modelBinder = new $data.modelBinder.mongoDBModelBinderConfigCompiler(query, this.includes, false);
        modelBinder.Visit(query.expression);
        
        this.Visit(query.expression, query.find);
        
        delete query.find.field;
        delete query.find.value;
        delete query.find.data;
        delete query.find.stack;
        delete query.find.or;
        
        return query;
    },
    VisitOrderExpression: function (expression, context) {
        this.Visit(expression.source, context);

        var orderCompiler = new $data.storageProviders.mongoDB.mongoDBOrderCompiler(this.provider);
        orderCompiler.compile(expression, context);
    },
    VisitPagingExpression: function (expression, context) {
        this.Visit(expression.source, context);

        var pagingCompiler = new $data.storageProviders.mongoDB.mongoDBPagingCompiler();
        pagingCompiler.compile(expression, context);
    },
    VisitFilterExpression: function (expression, context) {
        this.Visit(expression.source, context);

        var filterCompiler = new $data.storageProviders.mongoDB.mongoDBWhereCompiler(this.provider);
        context.data = "";
        filterCompiler.compile(expression.selector, context);
    },
    VisitProjectionExpression: function (expression, context) {
        this.Visit(expression.source, context);

        var projectionCompiler = new $data.storageProviders.mongoDB.mongoDBProjectionCompiler(this.context);
        projectionCompiler.compile(expression, context);
    }
});

$C('$data.storageProviders.mongoDB.mongoDBProvider', $data.StorageProviderBase, null,
{
    constructor: function(cfg, ctx){
        this.driver = $data.mongoDBDriver;
        this.context = ctx;
        this.providerConfiguration = $data.typeSystem.extend({
            dbCreation: $data.storageProviders.DbCreationType.DropTableIfChanged,
            address: '127.0.0.1',
            port: 27017,
            serverOptions: {},
            databaseName: 'test'
        }, cfg);
        if (this.providerConfiguration.server){
            if (typeof this.providerConfiguration.server === 'string') this.providerConfiguration.server = [{ address: this.providerConfiguration.server.split(':')[0] || '127.0.0.1', port: this.providerConfiguration.server.split(':')[1] || 27017 }];
            if (!(this.providerConfiguration.server instanceof Array)) this.providerConfiguration.server = [this.providerConfiguration.server];
            if (this.providerConfiguration.server.length == 1){
                this.providerConfiguration.address = this.providerConfiguration.server[0].address || '127.0.0.1';
                this.providerConfiguration.port = this.providerConfiguration.server[0].port || 27017;
                delete this.providerConfiguration.server;
            }
        }
    },
    _getServer: function(){
        if (this.providerConfiguration.server){
            var replSet = [];
            for (var i = 0; i < this.providerConfiguration.server.length; i++){
                var s = this.providerConfiguration.server[i];
                replSet.push(new this.driver.Server(s.address, s.port, s.serverOptions));
            }
            
            return new this.driver.ReplSetServers(replSet);
        }else return this.driver.Server(this.providerConfiguration.address, this.providerConfiguration.port, this.providerConfiguration.serverOptions);
    },
    initializeStore: function(callBack){
        var self = this;
        callBack = $data.typeSystem.createCallbackSetting(callBack);
        
        var server = this._getServer();
        new this.driver.Db(this.providerConfiguration.databaseName, server, { safe: false }).open(function(error, client){
            if (error){
                callBack.error(error);
                return;
            }
            
            var fn = function(error, client){
                var cnt = 0;
                var collectionCount = 0;
                var readyFn = function(client){
                    if (--cnt <= 0){
                        callBack.success(self.context);
                        client.close();
                    }
                };
                
                for (var i in self.context._entitySetReferences){
                    if (self.context._entitySetReferences.hasOwnProperty(i))
                        cnt++;
                }
                
                collectionCount = cnt;
                var sets = Object.keys(self.context._entitySetReferences);
                if (!sets.length) return readyFn(client);
                sets.forEach(function(i){
                    if (self.context._entitySetReferences.hasOwnProperty(i)){
                        client.collectionNames({ namesOnly: true }, function(error, names){
                            names = names.map(function(it){ return it.slice(it.lastIndexOf('.') + 1); });
                            switch (self.providerConfiguration.dbCreation){
                                case $data.storageProviders.DbCreationType.DropAllExistingTables:
                                    if (names.indexOf(self.context._entitySetReferences[i].tableName) >= 0){
                                        client.dropCollection(self.context._entitySetReferences[i].tableName, function(error, result){
                                            if (error){
                                                callBack.error(error);
                                                return;
                                            }
                                            if (self.context._entitySetReferences[i].tableOptions){
                                                client.createCollection(self.context._entitySetReferences[i].tableName, self.context._entitySetReferences[i].tableOptions, function(error, result){
                                                    if (error){
                                                        callBack.error(error);
                                                        return;
                                                    }
                                                    readyFn(client);
                                                });
                                            }else readyFn(client);
                                        });
                                    }else if (names.indexOf(self.context._entitySetReferences[i].tableName) < 0 && self.context._entitySetReferences[i].tableOptions){
                                        client.createCollection(self.context._entitySetReferences[i].tableName, self.context._entitySetReferences[i].tableOptions, function(error, result){
                                            if (error){
                                                callBack.error(error);
                                                return;
                                            }
                                            readyFn(client);
                                        });
                                    }else readyFn(client);
                                    break;
                                default:
                                    if (names.indexOf(self.context._entitySetReferences[i].tableName) < 0 && self.context._entitySetReferences[i].tableOptions){
                                        client.createCollection(self.context._entitySetReferences[i].tableName, self.context._entitySetReferences[i].tableOptions, function(error, result){
                                            if (error){
                                                callBack.error(error);
                                                return;
                                            }
                                            readyFn(client);
                                        });
                                    }else readyFn(client);
                                    break;
                            }
                        });
                    }
                });
            };
            
            if (self.providerConfiguration.username){
                client.authenticate(self.providerConfiguration.username, self.providerConfiguration.password || '', function(error, result){
                    if (error){
                        callBack.error(error);
                        return;
                    }
                    
                    if (result){
                        fn(error, client);
                        return;
                    }
                });
            }else fn(error, client);
        });
    },
    executeQuery: function(query, callBack){
        var self = this;
        callBack = $data.typeSystem.createCallbackSetting(callBack);
        
        var entitySet = query.context.getEntitySetFromElementType(query.defaultType);
        new $data.storageProviders.mongoDB.mongoDBCompiler().compile(query);
        
        var server = this._getServer();
        new this.driver.Db(this.providerConfiguration.databaseName, server, { safe: false }).open(function(error, client){
            if (error){
                callBack.error(error);
                return;
            }
            
            var collection = new self.driver.Collection(client, entitySet.tableName);
            var find = query.find;
            //console.log(JSON.stringify(find.query));

            var cb = function(error, results){
                if (error){
                    callBack.error(error);
                    return;
                }

                query.rawDataList = results instanceof Array ? results : [{ cnt: results }];
                query.context = self.context;

                callBack.success(query);
                client.close();
            };
            
            var fn = function(){
                switch (query.expression.nodeType){
                    case $data.Expressions.ExpressionType.Count:
                        collection.find(find.query, find.options).count(cb);
                        break;
                    case $data.Expressions.ExpressionType.BatchDelete:
                        collection.remove(find.query, { safe: true }, cb);
                        break;
                    default:
                        collection.find(find.query, find.options).toArray(cb);
                        break;
                }
            };
            
            if (self.providerConfiguration.username){
                client.authenticate(self.providerConfiguration.username, self.providerConfiguration.password, function(error, result){
                    if (error){
                        callBack.error(error);
                        return;
                    }
                    
                    if (result) fn();
                });
            }else fn();
        });
    },
    _typeFactory: function(type, value, converter){
        var type = Container.resolveName(type);
        var converterFn = converter ? converter[type] : undefined;
        return converter && converter[type] ? converter[type](value) : new (Container.resolveType(type))(value);
    },
    _saveCollections: function(callBack, collections){
        var self = this;
        var successItems = 0;
        var server = this._getServer();
        
        var counterState = 0;
        var counterFn = function(callback){
            if (--counterState <= 0) callback();
        }
        
        var insertFn = function(client, c, collection){
            var docs = [];
            for (var i = 0; i < c.insertAll.length; i++){
                var d = c.insertAll[i];
                var props = Container.resolveType(d.type).memberDefinitions.getPublicMappedProperties();
                for (var j = 0; j < props.length; j++){
                    var p = props[j];
                    if (p.concurrencyMode === $data.ConcurrencyMode.Fixed){
                        d.data[p.name] = 0;
                    }else if (!p.computed){
                        if (Container.resolveType(p.type) === $data.Array && p.elementType && Container.resolveType(p.elementType) === $data.ObjectID){
                            d.data[p.name] = self._typeFactory(p.type, d.data[p.name], self.fieldConverter.toDb);
                            var arr = d.data[p.name];
                            if (arr){
                                for (var k = 0; k < arr.length; k++){
                                    arr[k] = self._typeFactory(p.elementType, arr[k], self.fieldConverter.toDb);
                                }
                            }
                        }else{
                            d.data[p.name] = self._typeFactory(p.type, d.data[p.name], self.fieldConverter.toDb);//self.fieldConverter.toDb[Container.resolveName(Container.resolveType(p.type))](d.data[p.name]);
                        }
                        if (d.data[p.name] && d.data[p.name].initData) d.data[p.name] = d.data[p.name].initData;
                    }else if (typeof d.data[p.name] === 'string'){
                        d.data['_id'] = self._typeFactory(p.type, d.data[p.name], self.fieldConverter.toDb);
                    }
                }

                docs.push(d.data);
            }
            
            collection.insert(docs, { safe: true }, function(error, result){
                if (error){
                    callBack.error(error);
                    return;
                }
                
                for (var k = 0; k < result.length; k++){
                    var it = result[k];
                    var d = c.insertAll[k];
                    var props = Container.resolveType(d.type).memberDefinitions.getPublicMappedProperties();
                    for (var j = 0; j < props.length; j++){
                        var p = props[j];
                        d.entity[p.name] = self._typeFactory(p.type, it[p.computed ? '_id' : p.name], self.fieldConverter.fromDb); //self.fieldConverter.fromDb[Container.resolveName(Container.resolveType(p.type))](it[p.computed ? '_id' : p.name]);
                    }
                }
                
                successItems += result.length;
                
                if (c.removeAll && c.removeAll.length){
                    removeFn(client, c, collection);
                }else{
                    if (c.updateAll && c.updateAll.length){
                        updateFn(client, c, collection);
                    }else{
                        esFn(client, successItems);
                    }
                }
            });
        };
        
        var updateFn = function(client, c, collection){
            counterState = c.updateAll.length;
            for (var i = 0; i < c.updateAll.length; i++){
                var u = c.updateAll[i];
                var where = {};
                
                var keys = Container.resolveType(u.type).memberDefinitions.getKeyProperties();
                for (var j = 0; j < keys.length; j++){
                    var k = keys[j];
                    where[k.computed ? '_id' : k.name] = self.fieldConverter.toDb[Container.resolveName(Container.resolveType(k.type))](u.entity[k.name]);
                }
                
                var set = {};
                var props = Container.resolveType(u.type).memberDefinitions.getPublicMappedProperties();
                for (var j = 0; j < props.length; j++){
                    var p = props[j];
                    if (p.concurrencyMode === $data.ConcurrencyMode.Fixed){
                        where[p.name] = self._typeFactory(p.type, u.entity[p.name], self.fieldConverter.toDb);
                        if (!set.$inc) set.$inc = {};
                        set.$inc[p.name] = 1;
                    }else if (!p.computed){
                        if (typeof u.entity[p.name] === 'undefined') continue;
                        if (Container.resolveType(p.type) === $data.Array && p.elementType && Container.resolveType(p.elementType) === $data.ObjectID){
                            set[p.name] = self._typeFactory(p.type, u.entity[p.name], self.fieldConverter.toDb);
                            var arr = set[p.name];
                            if (arr){
                                for (var k = 0; k < arr.length; k++){
                                    arr[k] = self._typeFactory(p.elementType, arr[k], self.fieldConverter.toDb);
                                }
                            }
                        }else{
                            set[p.name] = self._typeFactory(p.type, u.entity[p.name], self.fieldConverter.toDb); //self.fieldConverter.toDb[Container.resolveName(Container.resolveType(p.type))](u.entity[p.name]);
                        }
                    }
                }
                
                var fn = function(u){
                    collection.update(where, { $set: set }, { safe: true }, function(error, result){
                        if (error){
                            callBack.error(error);
                            return;
                        }
                        
                        if (result){
                            successItems++;
                            var props = Container.resolveType(u.type).memberDefinitions.getPublicMappedProperties();
                            for (var j = 0; j < props.length; j++){
                                var p = props[j];
                                if (p.concurrencyMode === $data.ConcurrencyMode.Fixed) u.entity[p.name]++;
                            }
                            
                            counterFn(function(){
                                esFn(client, successItems);
                            });
                        }else{
                            counterState--;
                            collection.find({ _id: where._id }, {}).toArray(function(error, result){
                                if (error){
                                    callBack.error(error);
                                    return;
                                }
                                
                                var it = result[0];
                                var props = Container.resolveType(u.type).memberDefinitions.getPublicMappedProperties();
                                for (var j = 0; j < props.length; j++){
                                    var p = props[j];
                                    u.entity[p.name] = self._typeFactory(p.type, it[p.computed ? '_id' : p.name], self.fieldConverter.fromDb);
                                }
                                
                                counterFn(function(){
                                    esFn(client, successItems);
                                });
                            });
                        }
                    });
                };
                
                fn(u);
            }
        };
        
        var removeFn = function(client, c, collection){
            counterState = c.removeAll.length;
            for (var i = 0; i < c.removeAll.length; i++){
                var r = c.removeAll[i];

                var keys = Container.resolveType(r.type).memberDefinitions.getKeyProperties();
                for (var j = 0; j < keys.length; j++){
                    var k = keys[j];
                    r.data[k.computed ? '_id' : k.name] = self.fieldConverter.toDb[Container.resolveName(Container.resolveType(k.type))](r.entity[k.name]);
                }
                
                var props = Container.resolveType(r.type).memberDefinitions.getPublicMappedProperties();
                for (var j = 0; j < props.length; j++){
                    var p = props[j];
                    if (!p.key) {
                        delete r.data[p.name];
                    }
                }
                
                collection.remove(r.data, { safe: true }, function(error, result){
                    if (error){
                        callBack.error(error);
                        return;
                    }
                    
                    if (result) successItems++;
                    else counterState--;
                    
                    counterFn(function(){
                        if (c.updateAll && c.updateAll.length){
                            updateFn(client, c, collection);
                        }else esFn(client, successItems);
                    });
                });
            }
        };
        
        var keys = Object.keys(collections);
        var readyFn = function(client, value){
            callBack.success(value);
            client.close();
        };
        
        var esFn = function(client, value){
            if (keys.length){
                var es = keys.pop();
                if (collections.hasOwnProperty(es)){
                    var c = collections[es];
                    var collection = new self.driver.Collection(client, es);
                    if (c.insertAll && c.insertAll.length){
                        insertFn(client, c, collection);
                    }else{
                        if (c.removeAll && c.removeAll.length){
                            removeFn(client, c, collection);
                        }else{
                            if (c.updateAll && c.updateAll.length){
                                updateFn(client, c, collection);
                            }else{
                                readyFn(client, 0);
                            }
                        }
                    }
                }
            }else readyFn(client, value);
        };
        
        new this.driver.Db(this.providerConfiguration.databaseName, server, { safe: false }).open(function(error, client){
            if (error){
                callBack.error(error);
                return;
            }
            
            if (self.providerConfiguration.username){
                client.authenticate(self.providerConfiguration.username, self.providerConfiguration.password, function(error, result){
                    if (error){
                        callBack.error(error);
                        return;
                    }
                    
                    if (result) esFn(client);
                });
            }else esFn(client);
        });
    },
    saveChanges: function(callBack, changedItems){
        var self = this;
        if (changedItems.length){
            var independentBlocks = this.buildIndependentBlocks(changedItems);
            
            var convertedItems = [];
            var collections = {};
            for (var i = 0; i < independentBlocks.length; i++){
                for (var j = 0; j < independentBlocks[i].length; j++) {
                    convertedItems.push(independentBlocks[i][j].data);
                    
                    var es = collections[independentBlocks[i][j].entitySet.name];
                    if (!es){
                        es = {};
                        collections[independentBlocks[i][j].entitySet.name] = es;
                    }
                    
                    var initData = { entity: independentBlocks[i][j].data, data: this.save_getInitData(independentBlocks[i][j], convertedItems), type: Container.resolveName(independentBlocks[i][j].data.getType()) };
                    switch (independentBlocks[i][j].data.entityState){
                        case $data.EntityState.Unchanged: continue; break;
                        case $data.EntityState.Added:
                            if (!es.insertAll) es.insertAll = [];
                            es.insertAll.push(initData);
                            break;
                        case $data.EntityState.Modified:
                            if (!es.updateAll) es.updateAll = [];
                            es.updateAll.push(initData);
                            break;
                        case $data.EntityState.Deleted:
                            if (!es.removeAll) es.removeAll = [];
                            es.removeAll.push(initData);
                            break;
                        default: Guard.raise(new Exception("Not supported Entity state"));
                    }
                }
            }
            
            this._saveCollections(callBack, collections);
        }else{
            callBack.success(0);
        }
    },
    save_getInitData: function(item, convertedItems) {
        var self = this;
        item.physicalData = this.context._storageModel.getStorageModel(item.data.getType()).PhysicalType.convertTo(item.data, convertedItems);
        var serializableObject = {}
        item.physicalData.getType().memberDefinitions.asArray().forEach(function (memdef) {
            if (memdef.kind == $data.MemberTypes.navProperty || memdef.kind == $data.MemberTypes.complexProperty || (memdef.kind == $data.MemberTypes.property && !memdef.notMapped)) {
                if (Container.resolveType(memdef.type) === $data.Array && memdef.kind === $data.MemberTypes.property && item.physicalData[memdef.name]){
                    serializableObject[memdef.name] = JSON.parse(JSON.stringify(item.physicalData[memdef.name]));
                }else{
                    serializableObject[memdef.computed ? '_id' : memdef.name] = item.physicalData[memdef.name];
                }
            }
        }, this);
        return serializableObject;
    },
    
    supportedDataTypes: {
        value: [$data.Integer, $data.String, $data.Number, $data.Blob, $data.Boolean, $data.Date, $data.ObjectID, $data.Object, $data.GeographyPoint, $data.Guid,
            $data.GeographyLineString, $data.GeographyPolygon, $data.GeographyMultiPoint, $data.GeographyMultiLineString, $data.GeographyMultiPolygon, $data.GeographyCollection,
            $data.GeometryPoint, $data.GeometryLineString, $data.GeometryPolygon, $data.GeometryMultiPoint, $data.GeometryMultiLineString, $data.GeometryMultiPolygon, $data.GeometryCollection],
        writable: false
    },
    
    supportedBinaryOperators: {
        value: {
            equal: { mapTo: ':', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression] },
            notEqual: { mapTo: '$ne', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression] },
            equalTyped: { mapTo: ':', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression] },
            notEqualTyped: { mapTo: '$ne', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression] },
            greaterThan: { mapTo: '$gt', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression] },
            greaterThanOrEqual: { mapTo: '$gte', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression] },

            lessThan: { mapTo: '$lt', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression] },
            lessThenOrEqual: { mapTo: '$lte', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression] },
            or: { mapTo: '$or', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression] },
            and: { mapTo: '$and', dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression] },

            /*add: { mapTo: 'add', dataType: "number", allowedIn: [$data.Expressions.FilterExpression] },
            divide: { mapTo: 'div', allowedIn: [$data.Expressions.FilterExpression] },
            multiply: { mapTo: 'mul', allowedIn: [$data.Expressions.FilterExpression] },
            subtract: { mapTo: 'sub', allowedIn: [$data.Expressions.FilterExpression] },
            modulo: { mapTo: 'mod', allowedIn: [$data.Expressions.FilterExpression] },*/

            "in": { mapTo: "$in", allowedIn: [$data.Expressions.FilterExpression] }
        }
    },

    supportedUnaryOperators: {
        value: {
            not: { mapTo: '$nor' }
        }
    },

    supportedFieldOperations: {
        value: {
            /* string functions */

            contains: {
                dataType: "boolean", allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "substring", dataType: "string" }]
            },

            startsWith: {
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "string" }, { name: "strFragment", dataType: "string" }]
            },

            endsWith: {
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "string" }, { name: "strFragment", dataType: "string" }]
            }/*,

            length: {
                dataType: "number", allowedIn: [$data.Expressions.FilterExpression, $data.Expressions.ProjectionExpression],
                parameters: [{ name: "@expression", dataType: "string" }]
            },

            indexOf: {
                dataType: "number", allowedIn: [$data.Expressions.FilterExpression],
                baseIndex: 1,
                parameters: [{ name: '@expression', dataType: "string" }, { name: 'strFragment', dataType: 'string' }]
            },

            replace: {
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: '@expression', dataType: "string" }, { name: 'strFrom', dataType: 'string' }, { name: 'strTo', dataType: 'string' }]
            },

            substr: {
                mapTo: "substring",
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "string" }, { name: "startFrom", dataType: "number" }, { name: "length", dataType: "number", optional: "true" }]
            },

            toLowerCase: {
                mapTo: "tolower",
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "string" }]
            },

            toUpperCase: {
                mapTo: "toupper",
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "string" }]

            },

            trim: {
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "string" }]
            },


            concat: {
                dataType: "string", allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "string" }, { name: "strFragment", dataType: "string" }]
            },*/


            /* data functions */

            /*day: {
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            hour: {
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            minute: {
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            month: {
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            second: {
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            year: {
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },*/

            /* number functions */
            /*round: {
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            floor: {
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            },
            ceiling: {
                allowedIn: [$data.Expressions.FilterExpression],
                parameters: [{ name: "@expression", dataType: "date" }]
            }*/
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
            batchDelete: {},
            single: {},
            /*some: {
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
            },*/
            take: {},
            skip: {},
            orderBy: {},
            orderByDescending: {},
            first: {}/*,
            include: {}*/
        },
        enumerable: true,
        writable: true
    },
    fieldConverter: {
        value: {
            fromDb: {
                '$data.Integer': function (number) { return number; },
                '$data.Number': function (number) { return number; },
                '$data.Date': function (date) { return date ? new Date(date) : date; },
                '$data.String': function (text) { return text; },
                '$data.Boolean': function (bool) { return bool; },
                '$data.Blob': function (blob) { return blob; },
                '$data.Object': function (o) { if (o === undefined) { return new $data.Object(); } return o; },
                '$data.Array': function (o) { if (o === undefined) { return new $data.Array(); } return o; },
                '$data.ObjectID': function (id) { return id ? new Buffer(id.toString(), 'ascii').toString('base64') : id; },
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
                "$data.Guid": function (g) { return g ? $data.parseGuid(g) : g; }
            },
            toDb: {
                '$data.Integer': function (number) { return number; },
                '$data.Number': function (number) { return number; },
                '$data.Date': function (date) { return date; },
                '$data.String': function (text) { return text; },
                '$data.Boolean': function (bool) {
                    if (typeof bool === 'string') {
                        switch (bool) {
                            case 'true': case 'true': case 'TRUE':
                            case 'yes': case 'Yes': case 'YES':
                                return true;
                            default:
                                return false;
                        }
                    }
                    //return typeof bool === 'string' ? (bool === 'true' ? true : false) : !!bool;
                    return bool === null || bool === undefined ? null : !!bool;
                },
                '$data.Blob': function (blob) { return blob; },
                '$data.Object': function (o) { return o; },
                '$data.Array': function (o) { return o; },
                '$data.ObjectID': function (id) {
                    if (id && typeof id === 'string'){
                        return new $data.mongoDBDriver.ObjectID.createFromHexString(new Buffer(id, 'base64').toString('ascii'));
                    }else return id;
                },
                '$data.GeographyPoint': function (g) { return g; },
                '$data.GeographyLineString': function (g) { return g; },
                '$data.GeographyPolygon': function (g) { return g; },
                '$data.GeographyMultiPoint': function (g) { return g; },
                '$data.GeographyMultiLineString': function (g) { return g; },
                '$data.GeographyMultiPolygon': function (g) { return g; },
                '$data.GeographyCollection': function (g) { return g; },
                '$data.GeometryPoint': function (g) { return g; },
                '$data.GeometryLineString': function (g) { return g; },
                '$data.GeometryPolygon': function (g) { return g; },
                '$data.GeometryMultiPoint': function (g) { return g; },
                '$data.GeometryMultiLineString': function (g) { return g; },
                '$data.GeometryMultiPolygon': function (g) { return g; },
                '$data.GeometryCollection': function (g) { return g; },
                "$data.Guid": function (g) { return g ? g.value : g; }
            }
        }
    }
}, {
    isSupported: {
        get: function(){
            if (!$data.mongoDBDriver) return false;
            return true;
        },
        set: function(value){}
    }
});

if ($data.storageProviders.mongoDB.mongoDBProvider.isSupported){
    $data.StorageProviderBase.registerProvider('mongoDB', $data.storageProviders.mongoDB.mongoDBProvider);
}
try { if (typeof navigator === 'undefined') navigator = window.navigator = require('navigator'); }catch(err){}
if (typeof btoa === 'undefined') btoa = window.btoa = function(buffer){ return new Buffer(buffer, 'ascii').toString('base64'); };

$data.Class.define('$data.storageProviders.mongoDB.mongoDBProvider.ClientObjectID', null, null, {
    constructor: function(){
        var time = Math.floor(new Date().getTime() / 1000).toString(16);
        
        var b64ua = btoa(navigator ? navigator.userAgent : 'nodejs');
        var machine = (b64ua.charCodeAt(0) + b64ua.charCodeAt(1)).toString(16) + (b64ua.charCodeAt(2) + b64ua.charCodeAt(3)).toString(16) + (b64ua.charCodeAt(4) + b64ua.charCodeAt(5)).toString(16);
        
        var pid = ('0000' + Math.floor(Math.random() * 0xffff).toString(16)).slice(-4);
        var inc = ('000000' + (++$data.storageProviders.mongoDB.mongoDBProvider.ClientObjectID.idSeed).toString(16)).slice(-6);
        
        this.toString = this.toLocaleString = this.valueOf = function(){ return btoa(time + machine + pid + inc); };
    },
    value: { value: null }
}, {
    idSeed: { value: Math.floor(Math.random() * 0xff) }
});
