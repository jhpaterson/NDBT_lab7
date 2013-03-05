using System.Collections.Generic;
using System.Data.Entity;

namespace StockService.Models
{
    public class StockContextInitializer : DropCreateDatabaseAlways<StockContext>
    {
        protected override void Seed(StockContext context)
        {
            base.Seed(context);

            Supplier sup1 = new Supplier { Name = "CheapCo", Contact = "Joe Cheap" };
            Supplier sup2 = new Supplier { Name = "SupaSave", Contact = "Bob Save" };
            Supplier sup3 = new Supplier { Name = "CostCutz", Contact = "George Cutz" };
            Supplier sup4 = new Supplier { Name = "LoadsaBargainz", Contact = "Ron Loads" };

            Stock st1 = new Stock
            {
                Description = "Beans 200g tin",
                Category = "Canned Vegetables",
                UnitPrice = 0.30m,
                UnitsInStock = 850,
                Suppliers = new List<Supplier> { sup1, sup2 }
            };

            Stock st2 = new Stock
            {
                Description = "Cornflakes 750g pack",
                Category = "Cereal",
                UnitPrice = 1.30m,
                UnitsInStock = 250,
                Suppliers = new List<Supplier> { sup2, sup3 }
            };

            Stock st3 = new Stock
            {
                Description = "Smoked ham 100g pack",
                Category = "Cold meat",
                UnitPrice = 0.60m,
                UnitsInStock = 450,
                Suppliers = new List<Supplier> { sup3, sup4 }
            };

            Stock st4 = new Stock
            {
                Description = "Beef mince 450g",
                Category = "Fresh meat",
                UnitPrice = 1.60m,
                UnitsInStock = 650,
                Suppliers = new List<Supplier> { sup1, sup4 }
            };
  
            context.Stocks.Add(st1);
            context.Stocks.Add(st2);
            context.Stocks.Add(st3);
            context.Stocks.Add(st4);

            context.SaveChanges();

        }
    }
}