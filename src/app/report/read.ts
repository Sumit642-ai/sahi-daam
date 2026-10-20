/**
 * Reads an .xlsx / .xls / .csv file into plain grids with SheetJS, in the
 * browser. This is the only module that imports SheetJS, and the upload
 * screen loads it on demand, so it never weighs on the app's first load.
 */
import * as XLSX from 'xlsx'

export interface Grid {
  name: string
  rows: unknown[][]
}

export function readWorkbook(bytes: Uint8Array, fileName: string): Grid[] {
  const csv = /\.csv$/i.test(fileName)
  const wb = XLSX.read(bytes, { type: 'array', cellDates: true, raw: csv, dense: true })
  return wb.SheetNames.map((name) => ({
    name,
    rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    }),
  }))
}
