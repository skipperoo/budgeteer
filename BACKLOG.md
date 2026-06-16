This is the backlog of Budgeteer

- [x] means done
- [ ] means that the issue is open

# TODO

- [x] Add document field to the transaction so that I can upload an image or a pdf of the receipt. The data should be added to the transaction encrypted blob and saved to the database. In the frontend when clicking on a transaction it should open a nice overlay card (like the new transaction form) where the transaction data is nicely formatted and the image is showed (if there is an image) or a link to open the document in a new page is shown
- [x] UI consistency and enhanchments
  - [x] Dashboard page:
    - [x] (desktop) The top cards are ok, but instead of AVG amount rename that in Average Amount and inside the card place a green\red incomes\expenses. The average must be computed based on the number of transaction in the timerange (e.g. tx = [ -10, 20, -30, 50], the card will report ((20+50)/2)/(|(-10 + (-30))/2|) -> 35/20 and the currency symbol).
    - [x] (desktop) The two pie charts should be replaced by the recent transactions card that has to be as tall as the All Assets chart on the left. the recent transaction height has to be fixed and the content scrollable (this is true also for mobile).
    - [x] (desktop) The two pie charts have to be moved under the All Assets and Recent transactions card and placed side by side, not stacked
  - [x] Accounts Page:
    - [x] (desktop) The account cards has to be smaller (less wide)
    - [x] (desktop & mobile) The page when opening an account should show a version of the main dashboard fixed using only the account data: remove the Total Accounts card and keep everything else.
  - [x] General:
    - [x] (mobile) editing and opening a transaction should open a drawer instead of a dialog as on the desktop.
    - [x] (mobile) enlarge the bottom navigation menu and add a bottom padding to it to dodge the iOS/Android bottom gesture area (1 or 2 em should be plenty)

- [x] Implement rules:
  - [x] Recurring payments
  - [x] Recurring transfers between two accounts or between two
  - [x] Server X25519 keypair (docker secret) + public-key endpoint
  - [x] Rule payloads encrypted with server's public key via ECIES
  - [x] Generated transactions encrypted with user's X25519 public key (ECIES `1|` prefix)
  - [x] Rule scheduler worker (configurable interval)
  - [x] Balance tracking on accounts for precondition checks
  - [x] Atomic multi-transaction execution (pgx.WithTx + SELECT FOR UPDATE)
  - [x] Frontend rules management page (create/list/edit/delete)
  - [x] Rules nav link in sidebar and bottom nav
- [ ] Implement mortgages and split payments
  - [ ] Select the amount, the duration period and the interest rate
  - [ ] Automatically create a transaction each month (the day of payment has to be settable) of the correct amount
  - [ ] IF the interest rate is != 0 the transaction info card must report the amount paid in interest

# BUGS

- [x] The categories are now saved in the local storage of the frontend: they must be saved in the backend under the user data (associated with its profile)
