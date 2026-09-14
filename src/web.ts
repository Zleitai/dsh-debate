// Presence-only Host half for the web plane.
//
// `dsh-client-modules` discovers browser bundles by scanning the HOST Loader's
// entries for packages that declare `dsh.client`. A package mounted only in an
// agent preset is not a host entry, so its `./client` bundle is never served to
// the browser. Mounting this no-op row in the web profile composition is what
// makes the panel load; it registers nothing and needs no realm.
//
// Never point that row at `dsh-debate/client`: a browser bundle mounted on the
// Host plane waits forever for the browser-only `slots` service.
export const name = 'dsh-debate-web';

export function apply(): void {
  // Intentionally empty: this row exists so the package is a host Loader entry.
}
