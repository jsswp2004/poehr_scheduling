import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { getValidToken } from "../../utils/auth";

/** Who is signed in ({ role, id }), read from the access token. The server still enforces every rule. */
export default function useMe() {
  const [me, setMe] = useState({ role: null, id: null });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const token = await getValidToken();
        const decoded = jwtDecode(token.access_token || token);
        if (live) setMe({ role: decoded.role || null, id: decoded.user_id ?? null });
      } catch (e) {
        /* stays unknown */
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  return me;
}
