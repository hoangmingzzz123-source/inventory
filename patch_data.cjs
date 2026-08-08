const fs = require('fs');

// Patch Products.tsx
let prod = fs.readFileSync('src/screens/Products.tsx', 'utf8');
if (!prod.includes('useDemo')) {
  prod = prod.replace(
    'import { products as initialProducts } from "../data/mockData"',
    `import { products as initialProducts } from "../data/mockData"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { fetchProducts } from "../lib/dataService"`
  );
  prod = prod.replace(
    'const [products, setProducts] = useState(initialProducts)',
    `const [products, setProducts] = useState<any[]>(initialProducts)
  const { isDemo } = useDemo()
  const { profile } = useAuth()

  useEffect(() => {
    fetchProducts({ isDemo, orgId: profile?.org_id }).then(res => {
      if (res.data) setProducts(res.data)
    })
  }, [isDemo, profile])`
  );
  fs.writeFileSync('src/screens/Products.tsx', prod);
}

// Patch PurchaseOrders.tsx
let po = fs.readFileSync('src/screens/PurchaseOrders.tsx', 'utf8');
if (!po.includes('useDemo')) {
  po = po.replace(
    'import { exportCsv, exportXlsx, ImportModal } from "./GenericList"',
    `import { exportCsv, exportXlsx, ImportModal } from "./GenericList"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { fetchPurchaseOrders } from "../lib/dataService"`
  );
  po = po.replace(
    'const [pos, setPOs] = useState(initPOs)',
    `const [pos, setPOs] = useState<any[]>(initPOs)
  const { isDemo } = useDemo()
  const { profile } = useAuth()

  import("react").then(({ useEffect }) => {
    useEffect(() => {
      fetchPurchaseOrders({ isDemo, orgId: profile?.org_id }).then(res => {
        if (res.data) setPOs(res.data)
      })
    }, [isDemo, profile])
  })`
  );
  po = po.replace(
    'import { useState } from "react"',
    'import { useState, useEffect } from "react"'
  );
  po = po.replace(
    'import("react").then(({ useEffect }) => {',
    ''
  ).replace(
    '  })',
    ''
  );
  fs.writeFileSync('src/screens/PurchaseOrders.tsx', po);
}
