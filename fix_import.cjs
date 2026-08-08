const fs = require('fs');
let code = fs.readFileSync('src/screens/GenericList.tsx', 'utf8');
code = code.replace(/import \{ Edit \} from "lucide-react";/g, '');
fs.writeFileSync('src/screens/GenericList.tsx', code);
