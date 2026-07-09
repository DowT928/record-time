declare module 'sql.js' {
  type InitOptions = {
    locateFile?: (file: string) => string
  }

  export default function initSqlJs(options?: InitOptions): Promise<unknown>
}
