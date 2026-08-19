This is the backlog of Budgeteer

- [x] means done
- [ ] means that the issue is open

# TODO

- [ ] Reports: create a download report button in the navbar (full text and icon on desktop but outline not solid, icon only on mobile) to go to the report page. There a create report button is present and once clicked asks the user if to generate a pdf, dump a csv of the transaction or dump some data in json. Please let him select the timerange and let him select which data to dump. The pdf report instead should be a report of the accounts balances, expenses/incomes, categories, and so on.
- [ ] Add the account creation date in the account details page
- [x] Admin panel:
  - [x] Use the same design language as the frontend
  - [x] Create a separate project served on a different port
  - [x] The admin panel is a simple CRUD application that allows the admin (only admin users can login). Those are stored in a different table and the first admin user is <admin@budgeteer.com> with password changeme.
  - [x] Admins cannot register, only the first admin can create the other admins with a password set by him, then the ui asks the user to change it upon first login (also the og admin is prompted to change it)
  - [x] This appication with its own backend allows the admins to manage the data on the database:
    - [x] All tables are reported to the frontend and can be consulted, bulk deleted, and edited
    - [x] Client-side migration page shows the migrations grouped by user with the list of completed and pending migrations. Also it allows to bulk reschedule a certain migration or to edit the status of the users migration.
    - [x] The notification and email dispatcher page allow the admin to insert a notification ans/or an email that will be dispateched to a list of selected users (allow to select All) by the application backend (it just writes to the db).
    - [x] Add this new stack to both docker composes

# BUGS

- [ ] UI: remove internal title from data management accordion and remove the internal cards, use a line separator between the 3 actions
- [ ] Email dispatcher: add a circuit breaker / backoff so repeated SMTP connection failures pause the worker instead of retrying in a tight 5s loop. **Why:** a transient outage (lost connectivity or a DNS hiccup) currently burns the 5-attempt retry limit in ~25 seconds and permanently marks every queued email as `failed`. A short network blip should never exhaust a queued email's retry budget. (Incident: 2026-08-13)
- [ ] Email dispatcher: distinguish transient errors (DNS/TLS/network/timeout) from permanent SMTP rejections (5xx). Transient → keep the email `pending` and retry after backoff; permanent → mark `failed` immediately. **Why:** today a transient `tls dial: lookup smtps.aruba.it ... server misbehaving` (Docker embedded DNS 127.0.0.11) is treated like a permanent failure, exhausting retries and losing emails that should simply be re-sent once the network recovers. (Incident: 2026-08-13)
- [ ] Email dispatcher: add a requeue sweep that flips stale `status='failed'` emails back to `pending` after a cooldown (e.g. 15 minutes). **Why:** once an email is marked `failed`, no code path ever retries it (`ListPending` only selects `pending`), so emails lost during an outage are never re-sent after restore. This is exactly the reported behavior: after the connection came back, the previously-queued emails were gone forever. (Incident: 2026-08-13)
