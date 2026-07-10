This is the backlog of Budgeteer

- [x] means done
- [ ] means that the issue is open

# TODO

- [ ] Reports: create a download report button in the navbar (full text and icon on desktop but outline not solid, icon only on mobile) to go to the report page. There a create report button is present and once clicked asks the user if to generate a pdf, dump a csv of the transaction or dump some data in json. Please let him select the timerange and let him select which data to dump. The pdf report instead should be a report of the accounts balances, expenses/incomes, categories, and so on.

- [x] Categories management:
  - [x] Pre-step - reorganize the settings in accordions:
    - [x] Account - Keep it as is but make it an accordion card
    - [x] General - merge default currency, locale and default commission
    - [x] Appearace - keep it as is but make it an accordion card
    - [x] Data management - make it a new unified accordion card
  - [x] Categories - create a categories management accordion card between general and appearance
  - [x] Allow the user to edit the categories:
    - [x] Add categories
    - [x] Rename, set a fixed color, set an icon (use an icon picker and use lucide-react icons and a search bar to search for them)
    - [x] Delete categories
  - [x] The colors of the categories in the pie charts must follow the one set by the user in the settings, If the user did not make an explicit selection, set a default color (different for each one).
  - [x] If an Icon is selected, show the icon instead of the name in the pie chart legend. However, in the dropdowns of the categories, always keep names.
  - [x] Add an overlay when the user taps on mobile or hovers on desktop on the + N more badge
- [ ] Add the account creation date in the account details page

- [x] Categories management — remaining polish:
  - [x] Remove clear button in color picker popover
  - [x] Assign default deterministic color upon category creation
  - [x] Remove surrounding box and title from "Add new category" form
  - [x] Add global toggle switch to enable/disable icons in pie charts (fall back to names + color dots)
  - [x] Replace per-category hide/disable (eye) button with edit (pencil) button that triggers inline rename
  - [x] When a category is deleted, warn user then batch-update all transactions with that category to "General"
  - [x] Account accordion in settings should be closed by default

# BUGS
