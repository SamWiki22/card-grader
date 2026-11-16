import "../styles/globals.css";
import "../styles/packs.css";
import { CartProvider } from "../lib/cart";
import { MeProvider } from "../lib/me";

export default function App({ Component, pageProps }) {
  return (
    <MeProvider>
      <CartProvider>
        <Component {...pageProps} />
      </CartProvider>
    </MeProvider>
  );
}
