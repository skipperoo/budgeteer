# Changelog

All notable user-facing changes to Budgeteer are documented here.

---

## [Unreleased]

### Admin Panel
- New standalone admin panel available at `/admin` (port 5174)
- Login with `admin@budgeteer.com` (password: `changeme` — you'll be prompted to change it on first login)
- **Table browser**: view, search, edit, and bulk-delete any database table
- **Client migrations**: monitor all users' migration status, re-queue or edit status
- **Dispatch**: send in-app notifications and/or emails to selected users or everyone
- **Admin management**: create and remove admin users

### Categories
- Categories now have a stable `id` — renaming a category instantly updates the display everywhere, no transaction update needed
- Deleting a category shows transactions as "General" automatically
- Categories can be assigned a colour (click the colour dot) and an icon (click the palette button)
- Global toggle in Settings → Categories to show/hide icons in pie chart legends
- Pie chart legends show the "+ N more" popover on hover with the full list
- Settings page reorganised into accordion cards (Account, General, Categories, Appearance, Data Management)

### Data Management
- **Download Data**: export all your data as a zip archive
- **Restore Data**: upload a previously downloaded archive (type "Guacamole" to confirm)
- **Delete Account**: permanently remove your account (type "DELETE" to confirm)

### Transfers
- Account-to-account transfer support: toggle in the transaction form to move money between your own accounts
- Two linked transactions are created (expense in source, income in target)
- Transfers are excluded from dashboard/account stats and pie charts

### Migration System
- Client-side migrations run automatically after login (no user action needed)
- The `add_category_id` migration adds stable category ids to all existing transactions for seamless rename support

### Bug Fixes
- Renaming a category now works correctly (Save button no longer steals focus)
- Account accordion in Settings now closed by default
- Various UI consistency fixes across dashboard, accounts, and transaction cards
- Colour picker for categories no longer shows a non-functional "Clear" button
- Toast notifications for migration start/success/error
