const fs = require('fs');
let file = fs.readFileSync('src/screens/GenericList.tsx', 'utf8');

// I will patch the components one by one or create a general generic table.
// Since there are so many, maybe I should create a generic CRUD generator.
