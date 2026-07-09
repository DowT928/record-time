import type { FocusJournalApi } from '../../shared/types'

declare global {
  interface Window {
    focusJournal: FocusJournalApi
  }
}
