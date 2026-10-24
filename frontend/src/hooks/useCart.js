import { useState } from "react";
import * as api from "../api/index.js";

/** Puts a deal in the user's cart in the platform app. status: idle | adding | added | error */
export function useCart() {
  const [state, setState] = useState({ status: "idle", message: "", link: "" });
  const add = async (key) => {
    setState({ status: "adding", message: "" });
    try {
      const { link } = await api.addToCart(key);
      setState({ status: "added", message: "", link });
    } catch (e) {
      setState({ status: "error", message: e.message });
    }
  };
  return { ...state, add };
}
