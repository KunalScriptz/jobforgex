/// <reference types="vite/client" />
declare module "*.yaml?raw" {
  const src: string;
  export default src;
}
declare module "*.tex?raw" {
  const src: string;
  export default src;
}