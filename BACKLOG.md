This is the backlog of Budgeteer

- [x] means done
- [ ] means that the issue is open

# TODO

- [ ] Reports: create a download report button in the navbar (full text and icon on desktop but outline not solid, icon only on mobile) to go to the report page. There a create report button is present and once clicked asks the user if to generate a pdf, dump a csv of the transaction or dump some data in json. Please let him select the timerange and let him select which data to dump. The pdf report instead should be a report of the accounts balances, expenses/incomes, categories, and so on.

- [ ] Categories management:
  - [ ] Pre-step - reorganize the settings in accordions:
    - [ ] Account - Keep it as is but make it an accordion card
    - [ ] General - merge default currency, locale and default commission
    - [ ] Appearace - keep it as is but make it an accordion card
    - [ ] Data management - make it a new unified accordion card
  - [ ] Categories - create a categories management accordion card between general and appearance
  - [ ] Allow the user to edit the categories:
    - [ ] Add categories
    - [ ] Rename, set a fixed color, set an icon (use an icon picker and use lucide-react icons and a search bar to search for them). Add a button to enable/disable categories altogether and fall back to names and color only.
    - [ ] Delete categories
  - [ ] The colors of the categories in the pie charts must follow the one set by the user in the settings, If the user did not make an explicit selection, set a default color (different for each one).
  - [ ] If an Icon is selected, show the icon instead of the name in the pie chart legend. However, in the dropdowns of the categories, always keep names.
  - [ ] Add an overlay when the user taps on mobile or hovers on desktop on the + N more badge
- [ ] Add the account creation date in the account details page

# BUGS
