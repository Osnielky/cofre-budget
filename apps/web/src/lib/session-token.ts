// Cheap routing check only — the API verifies the signature. A token is usable
// when it is an unexpired access token; older sessions without typ: 'access'
// are rejected by the API, so treating them as logged-out avoids a dead dashboard.
export function isUsableSessionToken(token: string): boolean {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part));
    if (payload.typ !== 'access') return false;
    return payload.exp ? payload.exp * 1000 >= Date.now() : true;
  } catch {
    return false;
  }
}
