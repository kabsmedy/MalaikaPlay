export const API_BASE = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api')).replace(/\/$/, '');
export type OnlineTrack = { id:string; provider:'audius'|'jamendo'|'spotify'; providerId:string; title:string; artist:string; album?:string|null; artwork:string|null; duration:number; streamUrl:string|null; permalink:string|null; license?:string|null; downloadable:boolean; downloadUrl?:string|null };
export type AuthUser = { id:string; email:string; name:string; role:'user'|'admin'; photoUrl:string|null };

async function authRequest<T>(path:string, init:RequestInit={}) {
  const res = await fetch(`${API_BASE}${path}`, { ...init, credentials:'include' });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.message || 'Authentication request failed');
  return data as T;
}

export async function getCurrentUser() {
  return authRequest<{user:AuthUser}>('/auth/me');
}
export async function signIn(email:string,password:string) {
  return authRequest<{user:AuthUser}>('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
}
export async function signUp(name:string,email:string,password:string) {
  return authRequest<{user:AuthUser}>('/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,email,password})});
}
export async function signOut() {
  return authRequest<{ok:boolean}>('/auth/logout',{method:'POST'});
}
export async function uploadProfilePhoto(photo:File) {
  const form = new FormData();
  form.append('photo',photo);
  return authRequest<{photoUrl:string}>('/auth/profile-photo',{method:'POST',body:form});
}
export const mediaUrl = (path:string) => path.startsWith('/api/') ? `${API_BASE}${path.slice(4)}` : path;

export async function searchOnline(q:string, provider:'all'|'audius'|'jamendo'|'spotify'='all', offset=0, mode:'tracks'|'artists'='tracks', genre?:string, vocalOnly=true) {
  const params = new URLSearchParams({ q, provider, limit:provider==='spotify'?'10':'30', offset:String(offset), mode, vocalOnly:String(vocalOnly) });
  if (genre) params.set('genre', genre);
  const res = await fetch(`${API_BASE}/music/search?${params.toString()}`,{credentials:'include'});
  if (!res.ok) throw new Error((await res.json().catch(()=>({}))).message || 'Music search failed');
  return res.json() as Promise<{results:OnlineTrack[];notice:string}>;
}
export async function getTrending(offset=0) {
  const res = await fetch(`${API_BASE}/music/trending?offset=${offset}`,{credentials:'include'});
  if (!res.ok) throw new Error('Could not load trending music');
  return res.json() as Promise<{results:OnlineTrack[]}>;
}
