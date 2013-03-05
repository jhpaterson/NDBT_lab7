using System.Collections.Generic;

namespace StockService.Models
{
    public class Stock
    {
        public int StockId { get; set; }
        public string Description { get; set; }
        public string Category { get; set; }
        public decimal UnitPrice { get; set; }
        public int UnitsInStock { get; set; }
        public ICollection<Supplier> Suppliers { get; set; }
    }
}