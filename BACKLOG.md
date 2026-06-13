This is the backlog of Budgeteer

- [x] means done
- [ ] means that the issue is open

# TODO

- [x] Add document field to the transaction so that I can upload an image or a pdf of the receipt. The data should be added to the transaction encrypted blob and saved to the database. In the frontend when clicking on a transaction it should open a nice overlay card (like the new transaction form) where the transaction data is nicely formatted and the image is showed (if there is an image) or a link to open the document in a new page is shown
- [ ] Implement rules:
  - [ ] Recurring payments
  - [ ] Recurring transfers between two accounts or between two
- [ ] Implement mortgages and split payments
  - [ ] Select the amount, the duration period and the interest rate
  - [ ] Automatically create a transaction each month of the correct amount
  - [ ] IF the interest rate is != 0 the transaction must report the amount paid in interest

# BUGS

- [x] The categories are now saved in the local storage of the frontend: they must be saved in the backend under the user data (associated with its profile)
