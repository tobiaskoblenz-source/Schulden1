const store = require('./user-store-v170');
const originalVerify = store.verify;
store.verify = function(password, record){
  const passwordRecord = record && record.password ? record.password : record;
  return originalVerify(password, passwordRecord);
};
