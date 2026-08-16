import Head from "next/head";
import BBInventory from "../components/BBInventory";

export default function Home() {
  return (
    <>
      <Head>
        <title>BB Inventory</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#B5651D" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BB Inventory" />
        <link rel="manifest" href="/manifest.json" />
      </Head>
      <BBInventory />
    </>
  );
}
