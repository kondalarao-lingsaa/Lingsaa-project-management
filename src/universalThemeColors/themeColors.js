// const getTheme = () => {
//   if (typeof window !== "undefined") {
//     const stored = localStorage.getItem("settings");
//     return stored ? JSON.parse(stored) : { mode: "light" };
//   }
//   return { mode: "light" };
// };

// const theme = getTheme();
// const isLight = theme.mode === "light"

let cachedIsLight = null;

const checkIsLight = () => {
  if (cachedIsLight !== null) {
    return cachedIsLight;
  }

  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem("settings");
    cachedIsLight = stored ? JSON.parse(stored).mode === "light" : true;

    // Clear the cache at the end of the current JavaScript event loop tick.
    // This ensures localStorage is only read once per React render cycle, 
    // guaranteeing maximum performance with ZERO latency.
    Promise.resolve().then(() => {
      cachedIsLight = null;
    });
  } else {
    return true; // default for SSR
  }

  return cachedIsLight;
};

// export const ThemeStyles = {
const getDynamicStyles = (isLight) => ({

  // 🖋️ Text Colors
  titleAndCreateBtnAdj: `flex flex-col md:flex-row justify-between mb-2 mt-3`,
  tableColor: `shadow ${isLight ? "bg-white" : "bg-indigo-900/10"}`,
  textTitle: `text-2xl font-semibold ${isLight ? "text-gray-900" : "text-gray-300"}`,
  textSummary: `${isLight ? "text-gray-800" : "text-gray-200"}`,


  addNewBtnsBg: `inline-block text-center align-middle select-none cursor-pointer transition-colors font-semibold border border-0 me-2 p-1 h-9 w-auto rounded-lg text-nowrap ${isLight ? "text-white bg-blue-600 border-white" : "text-gray-900 bg-gray-300 shadow"}`,
  addNewBtnIcon: "p-1 text-sm text-gray-100",
  dashboardAnalBtn: `border text-nowrap h-9 w-auto rounded-lg ${isLight ? "text-gray-500 border-gray-300" : "text-gray-900 border-gray-600"}`,

  bookOpen: `h-4 w-5 hidden md:block cursor-pointer ${isLight ? "text-gray-900" : "text-gray-200 font-bold flex flex-col justify-center items-center rounded-full"}`,

  custVendModalDataText: "w-[30%] text-md text-gray-800 font-semibold",
  custVendModalDatasemiColon: `w-[10%] text-md ${isLight ? "text-gray-900 block" : "text-gray-400"}`,
  custVendModalDataValue: `w-auto text-md font-semibold ${isLight ? "text-gray-700" : "text-gray-800"}`,

  ModalHeader: `${isLight ? "bg-white text-indigo-900" : "bg-gray-900 text-gray-300"}`,
  dialogContentBg: `!p-4 ${isLight ? '' : 'modal-bg-dark-theme'}`,
  ModalbodyTitles: `text-xl font-semibold ${isLight ? "bg-white text-gray-900" : "text-gray-300"}`,
  modalTitleIcons: "h-5 w-5",
  modalTitleIconsBg: "p-1 bg-yellow-600 rounded-xl text-white",
  modalTitleBg: `flex items-center gap-1 border-b border-gray-200 pb-1 p-2 ${isLight ? "bg-gray-50" : "bg-gray-900"}`,
  paginationTheme: `appearance-none rounded-lg px-3 pr-8 text-sm font-semibold focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200 cursor-pointer shadow-sm w-full border-2 py-1 ${isLight ? "bg-white border-slate-200 text-slate-700 hover:border-blue-300" : "bg-[#2f334a] border-gray-700  text-gray-200 hover:border-blue-500"}`,
  stockBatchTableBg: `${isLight ? "bg-gray-200" : "bg-gray-800"}`,

  // Drawer Section Heading
  drawerHeadingSection: `space-y-4 animate-fadeIn mt-4 p-4 shadow-md rounded-sm ${isLight ? "bg-white border-white" : "bg-[#2F334A]"}`,

  drawerHeadingBox: `text-base font-semibold border-b rounded p-2 mb-3 flex items-center space-x-1 ${isLight ? "bg-gray-50 border-gray-200" : "border-gray-700 !border-gray-500"}`,

  drawerHeadingIcon: "h-4 w-4",
  drawerHeadingText: `text-[16px] font-[600] ${isLight ? "text-gray-900" : "text-gray-200"}`,

  // Form lables and inputs 
  // formLabels: `text-sm block ${isLight ? "text-gray-900" : "text-gray-400"}`,
  formLabels: `w-auto tracking-wide text-[14px] font-[600] universal-fonts ${isLight ? "universal-fonts !text-[#444242]" : "universal-fonts text-gray-200"}`,
  formsInputs: `w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/25 disabled:cursor-not-allowed ${isLight ? "border-gray-300 disabled:bg-gray-200 disabled:text-gray-600 light-theme-input-field" : "border-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:opacity-75 dark-theme-input-field"}`,
  formsInputsDropdown: `w-full rounded-md border appearance-none pl-3 pr-8 py-2 text-sm transition-colors focus:outline-none focus:border-[#86b7fe] focus:ring-4 focus:ring-[#0d6efd]/25 disabled:cursor-not-allowed ${isLight ? "border-gray-300 disabled:bg-gray-200 disabled:text-gray-600 light-theme-dropdown" : "border-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:opacity-75 dark-theme-dropdown"}`,
  tooltipText: "text-[13px]",

  // create-invoices-heading
  invHeadingBox: "flex items-center gap-2",
  invHeadingIcon: "h-4 w-4",
  invHeadingText: `text-[16px] font-[600] ${isLight ? "text-gray-900" : "text-gray-200"}`,

  // dashboards card headings
  analyticsCardTitle: `font-[600] ${isLight ? "text-[15px] text-gray-900" : "text-[15px] text-gray-200"}`,
  analyticsCardSubTitle: `leading-tight text-[12px] font-[600] ${isLight ? "text-gray-500" : "text-gray-100"}`,
  // Table 
  tableHeaderBg: `capitalize ${isLight ? "bg-gray-50" : "bg-slate-900/60"}`,
  tableHeadCellsHeight: "text-nowrap capitalize py-2.5 px-4 !text-start",
  tableBodyCellsHeight: "text-nowrap px-4 py-1.5 !text-start",
  tableBodyCellsHeightStockCurrentStock: "text-nowrap px-4 py-1.5 !text-center",
  tableActionWrapper: "flex justify-start items-center w-full pe-2",
  // tableAvatar: `!w-[38px] !h-[38px] !text-sm !font-bold !rounded-lg ${isLight ? "!bg-gradient-to-br !from-indigo-50 !to-indigo-100 !text-indigo-600 !border !border-indigo-100" : "!bg-indigo-500/10 !text-indigo-400 !border !border-indigo-500/20"}`,
  tableAvatar: `!w-[38px] !h-[38px] !text-sm !font-bold !rounded-lg !bg-[color-mix(in_srgb,var(--theme-solid)_12%,transparent)] !border !border-[color-mix(in_srgb,var(--theme-solid)_25%,transparent)] !text-[var(--theme-solid)] ${isLight ? "" : "brightness-[1.25]"}`,
  tableConversionText: "text-orange-400 max-w-[170px] overflow-hidden whitespace-nowrap text-ellipsis cursor-pointer",

  // listNoColor: `font-semibold flex flex-row items-center gap-1 cursor-pointer ${isLight ? "text-indigo-600 hover:text-indigo-800" : "text-indigo-400 hover:text-indigo-300"}`,
  listNoColor: `font-semibold flex flex-row items-center gap-1 cursor-pointer text-[var(--theme-solid)] ${isLight ? "hover:opacity-80" : "brightness-[1.15] hover:brightness-[1.3]"}`,
  listNoCancelColor: `line-through flex flex-row items-center gap-1 cursor-pointer ${isLight ? "text-gray-400" : "text-gray-500"}`,
  tableActionsIcon: `h-6 w-6 cursor-pointer ${isLight ? "text-gray-900" : "text-gray-200"}`,
  // tableAmountText: `!font-[600] text-nowrap ${isLight ? "!text-indigo-900" : "!text-indigo-300"}`,
  // tableAmountBell: `w-4 h-4 !mt-1 stroke-[2] cursor-pointer ${isLight ? "text-indigo-800" : "text-indigo-300"}`,
  tableAmountText: `!font-[600] text-nowrap pe-25 text-[var(--theme-solid)] ${isLight ? "brightness-75" : "brightness-[1.25]"}`,
  tableAmountTextWOPr: `!font-[600] text-nowrap text-[var(--theme-solid)] ${isLight ? "brightness-75" : "brightness-[1.25]"}`,
  tableAmountBell: `w-4 h-4 !mt-1 stroke-[2] cursor-pointer text-[var(--theme-solid)] ${isLight ? "brightness-75" : "brightness-[1.25]"}`,
  tablePartyNameText: "!text-nowrap !font-[600]",

  statCardsEyeOf: `text-gray-900 p-1 ${isLight ? "h-6.5 w-6.5" : "h-6.5 w-6.5"}`,
  statCardsEyeOpen: "text-gray-900 p-1",
  filtersColsBtn: "w-full flex flex-row justify-end gap-2 p-2",
  filterIcons: `h-4 w-5 cursor-pointer rounded-full ${isLight ? "text-gray-900" : "text-gray-200"}`,
  AdvancedFiltersPlus: `h-4 w-5 p-1 rounded cursor-pointer ${isLight ? "bg-gray-200 text-gray-900" : "bg-gray-700 text-gray-200"}`,
  AdvancedFiltersMinus: `h-4 w-5 p-1 rounded cursor-pointer ${isLight ? "bg-gray-200 text-gray-900" : "bg-gray-700 text-gray-200"}`,
  actionItemsColors: `h-4 w-4 cursor-pointer ${isLight ? "text-gray-900" : "text-gray-200"}`,
  moveVertItemsColors: `cursor-pointer ${isLight ? "text-gray-900" : "text-gray-200"}`,
  // createEyeBtnAlignments: isLight ? "flex items-center gap-4" : "flex items-center gap-4",
  createEyeBtnAlignments: "flex flex-col md:flex-row items-stretch md:items-center gap-2 md:!gap-4 mt-2 md:!mt-0",
  plusCircleIcon: `font-semibold me-1 ms-2 ${isLight ? "h-4 w-4" : "h-4 w-4"}`,
  searchAndFiltersAlignment: "md:flex flex-row justify-between items-start w-full",
  outsideSearchFilter: `w-full md:w-[35%] xl:w-[35%] 2xl:w-[26%] mt-3 overflow-hidden transition-all duration-500 ease-in-out ${isLight ? "p-2 md:m-2" : "p-2 md:m-2"}`,
  // filtersAndCustomColsAlignment: isLight ? "mb-3 overflow-auto flex flex-row items-center gap-2 me-3 mt-3" : "flex flex-row items-center gap-2 me-3 mt-3 mb-3 overflow-auto",
  filtersAndCustomColsAlignment: "overflow-auto flex flex-col md:flex-row items-stretch md:items-center gap-2 m-3",
  filterAndCustColBtn: `rounded-lg border text-nowrap ${isLight ? "!bg-[#f8f7fa] !border-gray-300 text-gray-900" : "text-gray-200 !border-[#6c757d]"}`,
  filterBtnActive: `${isLight ? "!bg-indigo-50 !border-indigo-500" : "!bg-indigo-900/50 !border-indigo-400"}`,
  createNewBtnText: `${isLight ? "me-1 p-1 text-sm" : "me-1 p-1 text-sm"}`,
  dashAnalText: `p-1 text-sm ${isLight ? "text-gray-900 me-1" : "text-gray-200 me-1"}`,
  iconAndContentAlignment: "flex flex-row items-center gap-1",
  filterContent: `text-[14px] text-nowrap ${isLight ? "text-gray-600" : "text-gray-300"}`,
  // filterContentActive: `!font-[600] ${isLight ? "!text-indigo-700" : "!text-indigo-300"}`,
  // filterIconActive: `${isLight ? "!text-indigo-700" : "!text-indigo-300"}`,
  filterContentActive: `!font-[600] ${isLight ? "!text-[color-mix(in_srgb,var(--theme-solid)_80%,black)]" : "!text-[color-mix(in_srgb,var(--theme-solid)_70%,white)]"}`,
  filterIconActive: `${isLight ? "!text-[color-mix(in_srgb,var(--theme-solid)_80%,black)]" : "!text-[color-mix(in_srgb,var(--theme-solid)_70%,white)]"}`,
  filterPanelAdj: `w-full flex gap-2 flex-wrap transition-all duration-300 ease-in-out md:ms-2 p-2 md:p-0`,
  advanceFiltersAdj: "w-full p-2",
  companyNameDropdown: "font-semibold text-xs",
  companySubNameDropdown: "text-xs text-gray-500",
  statCardsBg: `${isLight ? "bg-white" : "bg-gray-300"}`,

  // Products Or Service Drawer Styling
  batchFieldsInManageStockSection: "w-full md:w-1/4",
  taxAndPricingSection: "w-full md:w-1/2",
  responsiveFilters: "w-full md:w-[23%] xl:w-[23%] 2xl:w-[18%]",
  responsiveAdvFilters: `w-full md:w-[30%] lg:w-[25%] xl:w-[20%] 2xl:w-[17%]`,
  hsnB2BColHeaders: "text-gray-500 text-sm font-semibold",

  // Custom Columns Menu Styling
  customColMenuText: "!text-[14px]",
  customColMenuCheckboxGap: "me-2",

  // Action Dropdown Menu Styling
  actionMenuItem: `!flex !items-center !justify-between !gap-2 !py-1 !px-3 !text-[14px] !font-[500] group ${isLight ? "!text-gray-800" : "!text-gray-200"}`,
  actionMenuBox: "flex items-center gap-1",
  // actionMenuIcon: `h-4 w-4 transition-colors ${isLight ? "!text-gray-800 group-hover:!text-indigo-600" : "!text-gray-200 group-hover:!text-indigo-400"}`,
  // actionMenuEndIcon: `h-4 w-4 transition-colors ${isLight ? "!text-slate-400 group-hover:!text-indigo-600" : "!text-slate-500 group-hover:!text-indigo-400"}`,
  actionMenuIcon: `h-4 w-4 transition-colors ${isLight ? "!text-gray-800 group-hover:!text-[var(--theme-solid)]" : "!text-gray-200 group-hover:!text-[color-mix(in_srgb,var(--theme-solid)_70%,white)]"}`,
  actionMenuEndIcon: `h-4 w-4 transition-colors ${isLight ? "!text-slate-400 group-hover:!text-[var(--theme-solid)]" : "!text-slate-500 group-hover:!text-[color-mix(in_srgb,var(--theme-solid)_70%,white)]"}`,

  // prodBatchTab
  borderWhite: `border border-white text-center universal-fonts ${isLight ? "text-gray-900" : "text-gray-300"}`,

  // Badges & Indicators
  iconBadge: `text-[var(--theme-solid)] ${isLight ? "bg-[color-mix(in_srgb,var(--theme-solid)_10%,white)]" : "bg-[color-mix(in_srgb,var(--theme-solid)_20%,transparent)]"}`,
  dragDropZone: `cursor-pointer rounded-xl border-2 border-dashed transition flex flex-col items-center text-center p-3 border-[color-mix(in_srgb,var(--theme-solid)_40%,transparent)] ${isLight ? "bg-gray-50 hover:bg-[color-mix(in_srgb,var(--theme-solid)_5%,white)]" : "bg-[#25293C] hover:bg-[color-mix(in_srgb,var(--theme-solid)_10%,transparent)]"}`,
  themeBox: `${isLight ? "bg-[color-mix(in_srgb,var(--theme-solid)_5%,white)]" : "bg-[color-mix(in_srgb,var(--theme-solid)_10%,transparent)]"}`,
  themeBorderBox: `border ${isLight ? "bg-[color-mix(in_srgb,var(--theme-solid)_5%,white)] !border-[color-mix(in_srgb,var(--theme-solid)_20%,white)]" : "bg-[color-mix(in_srgb,var(--theme-solid)_10%,transparent)] !border-[color-mix(in_srgb,var(--theme-solid)_20%,transparent)]"}`,
  themeNav: `${isLight ? "bg-[color-mix(in_srgb,var(--theme-solid)_10%,white)]" : ""}`,
  // Buttons
  // saveBtn: `
  //   px-3 py-1.5 !text-[14px] text-white
  //   bg-gradient-to-r from-indigo-600 to-purple-600
  //   hover:from-indigo-700 hover:to-purple-700
  //   transition-colors
  //   [&.Mui-disabled]:opacity-50
  //   [&.Mui-disabled]:cursor-not-allowed
  // `,

  saveBtn: `
    px-3 py-1.5 !text-[14px] !text-gray-100
    bg-[linear-gradient(to_right,var(--theme-grad-start),var(--theme-grad-end))]
    hover:brightness-90
    transition-all
    [&.Mui-disabled]:opacity-50
    [&.Mui-disabled]:cursor-not-allowed
  `,
  printBtn: "px-2 py-1.5 !text-[14px] !text-gray-100 !bg-emerald-600 hover:!bg-emerald-700 !transition-colors",

  cancelBtn: "px-2 py-1.5 !text-[14px] !text-gray-100 !bg-gray-400 hover:!bg-gray-500 !transition-colors",

  btnIcon: "w-4 h-4",


  // 🧭 Layout
  container: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8",
  section: "py-6 sm:py-8 lg:py-10",

  // 🧩 States
  disabled: "opacity-50 cursor-not-allowed",


  // reUsable Drawer

  // drawerHeaderTxt: `text-[19px] font-[900] leading-none bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600`,
  // drawerHeaderTxt: `text-[19px] font-[900] leading-none bg-clip-text text-transparent bg-[linear-gradient(to_right,var(--theme-grad-start),var(--theme-grad-end))]`,
  drawerHeaderTxt: `text-[19px] font-[900] leading-none text-[var(--theme-solid)]`,
  drawerHeaderIcon: `w-6 h-8 text-[var(--theme-solid)]`,
  drawerSupportHeaderTxt: `text-gray-500 text-[13px] font-[600]`,

  // Pagination
  paginationActiveBtn: `bg-[linear-gradient(to_right,var(--theme-grad-start),var(--theme-grad-end))] text-white shadow-lg shadow-[color-mix(in_srgb,var(--theme-grad-start)_30%,transparent)] scale-105`,
  paginationInactiveBtn: isLight
    ? `bg-white border-2 border-slate-200 text-slate-600 hover:border-[color-mix(in_srgb,var(--theme-solid)_50%,transparent)] hover:text-[var(--theme-solid)] hover:bg-[color-mix(in_srgb,var(--theme-solid)_10%,transparent)] hover:scale-105`
    : `bg-transparent border !border-gray-700 text-gray-300 hover:border-[color-mix(in_srgb,var(--theme-solid)_50%,transparent)] hover:text-[var(--theme-solid)] hover:bg-[color-mix(in_srgb,var(--theme-solid)_20%,transparent)] hover:scale-105`,
  paginationPrevNextBtn: isLight
    ? `bg-white border-2 border-slate-200 text-slate-400 hover:border-[color-mix(in_srgb,var(--theme-solid)_50%,transparent)] hover:text-[var(--theme-solid)] hover:bg-[color-mix(in_srgb,var(--theme-solid)_10%,transparent)] disabled:hover:bg-white disabled:hover:border-slate-200 disabled:hover:text-slate-400`
    : `bg-transparent border !border-gray-700 text-gray-400 hover:border-[color-mix(in_srgb,var(--theme-solid)_50%,transparent)] hover:text-[var(--theme-solid)] hover:bg-[color-mix(in_srgb,var(--theme-solid)_20%,transparent)] disabled:hover:bg-transparent disabled:hover:border-gray-700 disabled:hover:text-gray-600`
// }
});

export const ThemeStyles = new Proxy(getDynamicStyles(true), {
  get: (target, prop) => getDynamicStyles(checkIsLight())[prop]
});

