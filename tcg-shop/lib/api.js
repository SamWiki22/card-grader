// next/link and the router add basePath automatically; fetch() does not.
export const apiUrl = path => `${process.env.NEXT_PUBLIC_BASE_PATH || ""}${path}`;
