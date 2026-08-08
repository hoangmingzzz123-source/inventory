const fs = require('fs');

let generic = fs.readFileSync('src/screens/GenericList.tsx', 'utf8');

generic = generic.replace(
  'import { customers, suppliers, warehouses, salesOrders, inventoryBalance, auditLogs, stockLedger } from "../data/mockData"',
  `import { customers, suppliers, warehouses, salesOrders, inventoryBalance, auditLogs, stockLedger } from "../data/mockData"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { fetchCustomers, fetchSuppliers, fetchWarehouses } from "../lib/dataService"`
);
generic = generic.replace(
  'import { useState, useRef } from "react"',
  'import { useState, useRef, useEffect } from "react"'
);

generic = generic.replace(
  'const [dataList, setDataList] = useState(customers)',
  `const [dataList, setDataList] = useState<any[]>(customers)
  const { isDemo } = useDemo()
  const { profile } = useAuth()
  useEffect(() => {
    fetchCustomers({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setDataList(res.data) })
  }, [isDemo, profile])`
);

generic = generic.replace(
  'const [dataList, setDataList] = useState(suppliers)',
  `const [dataList, setDataList] = useState<any[]>(suppliers)
  const { isDemo } = useDemo()
  const { profile } = useAuth()
  useEffect(() => {
    fetchSuppliers({ isDemo, orgId: profile?.org_id }).then(res => { if (res.data) setDataList(res.data) })
  }, [isDemo, profile])`
);

fs.writeFileSync('src/screens/GenericList.tsx', generic);
