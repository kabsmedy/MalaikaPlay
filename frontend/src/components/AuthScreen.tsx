import { useRef, useState, type FormEvent } from 'react';
import { AudioLines, Camera, Headphones, LoaderCircle, Music2 } from 'lucide-react';
import { signIn, signUp, uploadProfilePhoto, type AuthUser } from '../lib/api';
import './auth.css';

export default function AuthScreen({onAuthenticated}:{onAuthenticated:(user:AuthUser)=>void}){
  const [mode,setMode]=useState<'login'|'signup'>('login');
  const [name,setName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [photo,setPhoto]=useState<File|null>(null);
  const [preview,setPreview]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const photoInput=useRef<HTMLInputElement>(null);

  const submit=async(event:FormEvent)=>{
    event.preventDefault();
    setBusy(true);setError('');
    try{
      let user:AuthUser;
      if(mode==='signup'){
        const result=await signUp(name,email,password);
        user=result.user;
        if(photo){try{const uploaded=await uploadProfilePhoto(photo);user={...user,photoUrl:uploaded.photoUrl};}catch{setError('Your account is ready, but the photo could not be uploaded. You can add it after signing in.');}}
      }else user=(await signIn(email,password)).user;
      onAuthenticated(user);
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not sign you in. Please try again.');}
    finally{setBusy(false);}
  };

  const selectPhoto=(file?:File)=>{
    if(!file)return;
    if(file.size>5*1024*1024){setError('Choose an image smaller than 5 MB.');return;}
    setPhoto(file);setPreview(URL.createObjectURL(file));setError('');
  };

  return <main className="auth-page">
    <section className="auth-visual" aria-label="MalaikaPlay music">
      <div className="auth-visual-top"><span className="auth-mark"><AudioLines size={19}/></span><strong>Malaika<span>Play</span></strong></div>
      <div className="auth-story"><span className="auth-kicker"><i/> A SOUNDTRACK FOR YOUR LIFE</span><h1>Find your<br/>own rhythm.</h1><p>Your music, your space. Pick up where the feeling takes you.</p><div className="auth-listen"><Headphones size={17}/><span>Discover. Listen. Make it yours.</span></div></div>
      <span className="auth-visual-index">MP / 01</span>
    </section>
    <section className="auth-panel">
      <div className="auth-mobile-brand"><span className="auth-mark"><AudioLines size={19}/></span><strong>Malaika<span>Play</span></strong></div>
      <div className="auth-form-wrap">
        <div className="auth-form-heading"><span className="auth-kicker">YOUR MUSIC STARTS HERE</span><h2>{mode==='login'?'Welcome back':'Create your account'}</h2><p>{mode==='login'?'Sign in to enter your listening space.':'A few details, then the music is yours.'}</p></div>
        <div className="auth-mode" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode==='login'} className={mode==='login'?'active':''} onClick={()=>{setMode('login');setError('');}}>Sign in</button>
          <button type="button" role="tab" aria-selected={mode==='signup'} className={mode==='signup'?'active':''} onClick={()=>{setMode('signup');setError('');}}>Create account</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode==='signup'&&<>
            <label className="auth-photo-picker"><input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e=>selectPhoto(e.currentTarget.files?.[0])}/><span className="auth-photo-avatar"><span className="auth-photo-preview">{preview?<img src={preview} alt="Selected profile"/>:<Music2 size={22}/>}</span><i className="auth-photo-camera"><Camera size={13}/></i></span><span><strong>Profile picture</strong><small>Optional · JPG, PNG, WebP or GIF · up to 5 MB</small></span></label>
            <label className="auth-label">Your name<input autoComplete="name" value={name} onChange={e=>setName(e.target.value)} placeholder="How should we call you?" required maxLength={80}/></label>
          </>}
          <label className="auth-label">Email address<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required maxLength={254}/></label>
          <label className="auth-label">Password<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='signup'?'At least 10 characters':'Enter your password'} required minLength={mode==='signup'?10:1} maxLength={128}/></label>
          {error&&<p className="auth-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy?<LoaderCircle className="auth-spinner" size={17}/>:null}{busy?'Please wait':mode==='login'?'Sign in to MalaikaPlay':'Create account'}<span aria-hidden="true">↗</span></button>
        </form>
        <p className="auth-security">Your account is private. Your password is never shared.</p>
      </div>
      <footer className="auth-footer"><span>© 2026 MALAIKAPLAY</span><span>MADE FOR THE LOVE OF MUSIC <i>♥</i></span></footer>
    </section>
  </main>;
}