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
  - [x] Add the alert dropdown (1 hour, 2 hours, 12 hours, 1 day, 2 days, 1 week, 2 weeks) to select when to receive a notification and email to be notified of the rule that will fire (send a report with the amount, the exact due time and the transfer details). In the backend accept the time as an offset so that more options could be added in future without modifying the backend
  - [x] For the rules and the expenses transactions ad the transfers add the commissions (default 0) to keep track of those (in the transaction info card keep them separate from the amount) too. A transaction of 100$ + 2$ commission will result in -102$ from the selected account.
  - [x] Rules should include also include Income type to automatically add income transaction
- [x] Implement invitation system for rules and joint accounts
  - [x] target_email field for user_transfer rules
  - [x] In-app notification panel (notifications table, list/mark-read API)
  - [x] Generic invitations table (rules + accounts)
  - [x] Accept/decline flow for invitations
  - [x] Receiver picks target account for rule invitations (encrypted with server's public key)
  - [x] Email notifications for invites (registered + unregistered users)
  - [x] 30-day expiry worker (deletes rules, marks expired, notifies sender)
  - [x] Unregistered invite flow (subscription email → register → see pending invites)
  - [x] Email-based account invitations (encrypt with server's public key, re-encrypt on accept)
  - [x] Unread notification badge in sidebar + bottom nav
  - [x] Periodic unread count polling
- [ ] Budget menu
  - [ ] Add per account monthly budgets
  - [ ] Add per category monthly budget
  - [ ] Notify the user via notifications and emails when you reach the 50%, 80% and 100% budget
  - [ ] Show in the dashboard and account details a horizontal bar chart where the full length is the budget and the amount fill is what you spent.
    - [ ] In the dashboard you have the expenses of every account combined and merged and the per category budgets
    - [ ] In the account details, only the account budget and account expenses
- [ ] Implement mortgages and split payments
  - [ ] Select the amount, the duration period and the interest rate
  - [ ] Automatically create a transaction each month (the day of payment has to be settable) of the correct amount
  - [ ] IF the interest rate is != 0 the transaction info card must report the amount paid in interest
- [ ] Add the remember device option not to be asked the otp again
  - [ ] Create a access secrets list on the user data
  - [ ] When the remember device option is on and the user issues the correct otp create a new secret associate with a fingerprint of the device
  - [ ] When the user signs in again make the login flow send the device fingerprint and the secret stored on the device and check that the couple <fingerprint, secret> is present in the access secret list. If so, let the user in, otherwise ask for the otp again and if the remember device option was set add the new <fingerprint, secret> to the backend. Note that the <fingerprint, secret> pair is encrypted using the user's password, so that it can be checked only when the user can provide basic authentication.

# BUGS

- [x] The categories are now saved in the local storage of the frontend: they must be saved in the backend under the user data (associated with its profile)
- [x] The funding transaction should not be displayed as a transaction and should not have a point in time: the account has that base opening balance as it always had it, then its value moves with the transactions added later on.
- [x] The "Average Tx Amount" card should be replaced by "Money flow" and should contain the cumulative incomes/expenses for the selected timerange
- [ ] Add the env variable `BASE_URL` to configure the base url to include in emails, notifications and so on.
- [ ] The income switch button in the new transaction form should be bright green no matter what is the theme
- [ ] The user should get an overlay when he tries to create a transaction without having at least 1 account availabl
- [ ] In account creation form remove the debit credit switch, leaving only the default mode (debit)
- [ ] Add the default currency, locale and theme switcher (light/dark) to user preferences sent to the db.
- [ ] Merge the theme switcher to the accent color card
- [ ] Change the locale/language card to locale only (add a line in the card as the example with multiple date formats, numbers, and so on). Also, the locale is not enforced in all the ui, fix that.
