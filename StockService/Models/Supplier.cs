using System.Collections.Generic;

namespace StockService.Models
{
    public class Supplier
    {
        public int SupplierId{get; set;}
        public string Name { get; set; }
        public string Contact { get; set; }
        public ICollection<Stock> Stocks { get; set; }
    }
}