declare module "@babel/core" {
  export function transformAsync(code: string, options?: any): Promise<any>;
  export const types: any;
}
