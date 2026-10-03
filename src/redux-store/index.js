import { configureStore } from '@reduxjs/toolkit'

import { pmsApi } from 'src/store/apps/pms/pmsApiBase'
// Registers the PMS endpoints (injectEndpoints side effect).
import 'src/store/apps/pms/projectsApi'
import 'src/store/apps/pms/tasksApi'
import 'src/store/apps/pms/teamApi'
import 'src/store/apps/pms/timesheetsApi'
import 'src/store/apps/pms/billingApi'
import 'src/store/apps/pms/dashboardApi'
import 'src/store/apps/pms/risksApi'
import 'src/store/apps/pms/documentsApi'
import 'src/store/apps/pms/planningApi'
import 'src/store/apps/pms/reportsApi'
import 'src/store/apps/pms/sprintsApi'
import 'src/store/apps/pms/workloadApi'
import 'src/store/apps/pms/communicationApi'
import 'src/store/apps/pms/settingsApi'
import 'src/store/apps/pms/expensesApi'

export const store = configureStore({
  reducer: {
    [pmsApi.reducerPath]: pmsApi.reducer
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false }).concat(pmsApi.middleware)
})
