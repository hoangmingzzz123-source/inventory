const fs = require('fs');
let code = fs.readFileSync('src/screens/Quotations.tsx', 'utf8');

code = code.replace(
  'import { exportCsv, exportXlsx, Toolbar } from "./GenericList"',
  `import { exportCsv, exportXlsx, Toolbar } from "./GenericList"
import { useDemo } from "../contexts/DemoContext"
import { useAuth } from "../contexts/AuthContext"
import { fetchQuotations } from "../lib/dataService"`
);

code = code.replace(
  /const \[data, setData\] = useState\(mockQuotations\)/,
  `const [data, setData] = useState<any[]>(mockQuotations)
  const { isDemo } = useDemo()
  const { profile } = useAuth()

  useEffect(() => {
    fetchQuotations({ isDemo, orgId: profile?.org_id }).then(res => {
      if (res.data) setData(res.data)
    })
  }, [isDemo, profile])`
);

code = code.replace(
  /import \{ useState \} from "react"/,
  'import { useState, useEffect } from "react"'
);

fs.writeFileSync('src/screens/Quotations.tsx', code);
