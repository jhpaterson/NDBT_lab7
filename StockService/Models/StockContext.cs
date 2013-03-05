using System.Data.Entity;

namespace StockService.Models
{
    public class StockContext : DbContext
    {
        public StockContext()
        {
            Database.SetInitializer<StockContext>(new StockContextInitializer());
        }

        public DbSet<Stock> Stocks { get; set; }
        public DbSet<Supplier> Suppliers { get; set; }
    }
}