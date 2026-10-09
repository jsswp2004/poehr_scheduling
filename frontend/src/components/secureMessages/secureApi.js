import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "../prescriptions/rxShared";

export { errorText };

export const CARE_LABEL = { acute: "Inpatient", emergency: "ED", ambulatory: "Clinic" };
export const MAX_IMAGES = 4;
export const MAX_UPLOAD_MB = 15;
export const MAX_BODY = 4000;

/** Tell the header badge and the thread list that something changed. */
export const announceChange = () => window.dispatchEvent(new Event("secure-messages-changed"));

async function call(method, url, body, extra = {}) {
  const headers = await authHeader();
  const res = await api[method](url, ...(method === "get" || method === "delete" ? [{ headers, ...extra }] : [body, { headers, ...extra }]));
  return res.data;
}

export const secure = {
  threads: (patient) => call("get", apiEndpoints.secureThreads, null, patient ? { params: { patient } } : {}),
  thread: (id) => call("get", apiEndpoints.secureThread(id)),
  start: (body) => call("post", apiEndpoints.secureThreads, body),
  messages: (id, params = {}) => call("get", apiEndpoints.secureMessages(id), null, { params }),
  send: (id, { body, priority, replyTo, files }) => {
    if (files && files.length) {
      const form = new FormData();
      form.append("body", body || "");
      form.append("priority", priority || "routine");
      if (replyTo) form.append("reply_to", replyTo);
      files.forEach((f) => form.append("images", f, f.name));
      return call("post", apiEndpoints.secureMessages(id), form);
    }
    return call("post", apiEndpoints.secureMessages(id), { body, priority: priority || "routine", ...(replyTo ? { reply_to: replyTo } : {}) });
  },
  read: (id, upto) => call("post", apiEndpoints.secureRead(id), upto ? { upto } : {}),
  retract: (messageId, reason = "") => call("post", apiEndpoints.secureRetract(messageId), { reason }),
  people: (q, all) => call("get", apiEndpoints.securePeople, null, { params: { ...(q ? { q } : {}), ...(all ? { all: 1 } : {}) } }),
  addMember: (id, user) => call("post", apiEndpoints.secureMembers(id), { user }),
  removeMember: (id, user) => call("delete", apiEndpoints.secureMember(id, user)),
  unread: () => call("get", apiEndpoints.secureUnread),
  picture: (id, thumb) => call("get", apiEndpoints.secureAttachment(id), null, { responseType: "blob", params: thumb ? { size: "thumb" } : {} }),
};
