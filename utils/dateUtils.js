// utils/dateUtils.js
exports.getAccountValidityDates = () => {
  const createdOn = new Date();
  const years = parseInt(process.env.ACCOUNT_VALID_YEARS || "3");
  const validTill = new Date(createdOn);
  validTill.setFullYear(validTill.getFullYear() + years);

  return {
    created_on: createdOn.toISOString().slice(0, 19).replace("T", " "),
    valid_till: validTill.toISOString().slice(0, 19).replace("T", " "),
  };
};


// exports.getAccountValidityDates = () => {
//   const createdOn = new Date();

//   // Dynamically use the years from the environment variable (default is 3 years)
//   const years = parseInt(process.env.ACCOUNT_VALID_YEARS || "3");
  
//   // Calculate the valid_till date by adding the years to the current date
//   const validTill = new Date(createdOn);
//   validTill.setFullYear(validTill.getFullYear() + years);

//   // For testing purposes: if you want to set valid_till to 2 minutes from the created date
//   const testValidTill = new Date(createdOn);
//   testValidTill.setMinutes(testValidTill.getMinutes() + 2);  // Set to 2 minutes later

//   return {
//     created_on: createdOn.toISOString().slice(0, 19).replace("T", " "),
//     valid_till: testValidTill.toISOString().slice(0, 19).replace("T", " "),
//   };
// };
