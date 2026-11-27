/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Sparkles,
  Edit3,
  Trophy,
  KeyRound,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  signInWithGoogle,
  registerWithEmailAndPassword,
  signInWithEmailPassword,
  sendAccountPasswordReset,
  resendVerificationEmail,
} from '../../lib/auth';
import {
  createUserProfileAtomic,
  updateUserProfileAtomic,
  EmailSchema,
  PasswordSchema,
  validateUsername,
  validateCountrySelection,
} from '../../logic/userProfile';
import {
  PROFILE_AVATARS,
  type ProfileAvatarId,
  type ProfileAuthProvider,
} from '../../types/profile';
import { getCountryByCode } from '../../data/countries';
import { CountrySelector } from './CountrySelector';
import { MemorySymbolIcon } from '../game/MemorySymbolIcon';
import { useAudio } from '../../context/AudioContext';

export type AuthModalMode = 'signin' | 'register' | 'forgot' | 'complete-profile' | 'profile';

export interface AuthProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: AuthModalMode;
}

export const AuthProfileModal: React.FC<AuthProfileModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'signin',
}) => {
  const { playClick } = useAudio();
  const {
    user,
    profile,
    isAnonymous,
    isSignedInAccount,
    needsProfileCompletion,
    setProfileState,
    signOut,
  } = useAuth();

  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [isEditingProfile, setIsEditingProfile] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [username, setUsername] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [countryCode, setCountryCode] = useState<string>('');
  const [avatarId, setAvatarId] = useState<ProfileAvatarId>('star');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setIsEditingProfile(false);

    if (needsProfileCompletion && user) {
      setMode('complete-profile');
      const suggestedName = (user.displayName || user.email?.split('@')[0] || '')
        .replace(/[^A-Za-z0-9_-]/g, '')
        .slice(0, 20);
      setUsername(suggestedName);
      setDisplayName(user.displayName || '');
      setCountryCode('');
      setAvatarId('star');
    } else if (isSignedInAccount && profile) {
      setMode('profile');
      setUsername(profile.username);
      setDisplayName(profile.displayName);
      setCountryCode(profile.countryCode);
      setAvatarId(profile.avatarId);
    } else {
      setMode(initialMode);
    }
  }, [isOpen, initialMode, isSignedInAccount, needsProfileCompletion, profile, user]);

  if (!isOpen) {
    return null;
  }

  const handleGoogleAuth = async () => {
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);
    setIsSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (result.linkedFromAnonymous) {
        setInfoMsg('Your guest identity was upgraded to your Google account!');
      } else if (result.hadLinkingConflict) {
        setInfoMsg('Signed in to your existing Google account.');
      }
      // AuthContext listener will load profile or trigger complete-profile
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);

    const emailCheck = EmailSchema.safeParse(email);
    if (!emailCheck.success) {
      setErrorMsg(emailCheck.error.issues[0]?.message ?? 'Invalid email address.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await signInWithEmailPassword({ email: emailCheck.data, password });
      setPassword('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const emailCheck = EmailSchema.safeParse(email);
      if (!emailCheck.success) {
        throw new Error(emailCheck.error.issues[0]?.message ?? 'Invalid email address.');
      }
      const { username: validUsername } = validateUsername(username);
      const pwCheck = PasswordSchema.safeParse(password);
      if (!pwCheck.success) {
        throw new Error(pwCheck.error.issues[0]?.message ?? 'Invalid password.');
      }
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match.');
      }
      const { countryCode: validCountry } = validateCountrySelection(countryCode);

      setIsSubmitting(true);
      const result = await registerWithEmailAndPassword({
        email: emailCheck.data,
        password,
        displayName: validUsername,
      });

      const createdProfile = await createUserProfileAtomic({
        uid: result.user.uid,
        username: validUsername,
        displayName: validUsername,
        email: result.user.email,
        emailVerified: result.user.emailVerified,
        countryCode: validCountry,
        avatarId,
        authProvider: 'password',
      });
      setProfileState(createdProfile);
      setPassword('');
      setConfirmPassword('');
      setInfoMsg(
        result.linkedFromAnonymous
          ? 'Guest account upgraded! Verification email sent.'
          : 'Account created! Please check your inbox to verify your email.'
      );
      setMode('profile');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);

    const emailCheck = EmailSchema.safeParse(email);
    if (!emailCheck.success) {
      setErrorMsg(emailCheck.error.issues[0]?.message ?? 'Please enter a valid email.');
      return;
    }

    setIsSubmitting(true);
    try {
      await sendAccountPasswordReset(emailCheck.data);
      setInfoMsg(`Password reset instructions have been sent to ${emailCheck.data}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send reset email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const { username: validUsername } = validateUsername(username);
      const { countryCode: validCountry } = validateCountrySelection(countryCode);
      const providerId = user.providerData?.[0]?.providerId;
      const authProvider: ProfileAuthProvider =
        providerId === 'google.com' ? 'google' : 'password';

      setIsSubmitting(true);
      const saved = await createUserProfileAtomic({
        uid: user.uid,
        username: validUsername,
        displayName: displayName.trim() || validUsername,
        email: user.email,
        emailVerified: user.emailVerified,
        countryCode: validCountry,
        avatarId,
        authProvider,
      });
      setProfileState(saved);
      setInfoMsg('Profile completed! Welcome to Pixel Afterglow.');
      setMode('profile');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const { username: validUsername } = validateUsername(username);
      const { countryCode: validCountry } = validateCountrySelection(countryCode);

      setIsSubmitting(true);
      const updated = await updateUserProfileAtomic({
        uid: user.uid,
        username: validUsername,
        displayName: displayName.trim() || validUsername,
        countryCode: validCountry,
        avatarId,
      });
      setProfileState(updated);
      setIsEditingProfile(false);
      setInfoMsg('Profile updated successfully.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    playClick();
    setErrorMsg(null);
    setInfoMsg(null);
    setIsSubmitting(true);
    try {
      await resendVerificationEmail();
      setInfoMsg('Verification email sent! Please check your inbox.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send verification email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    playClick();
    setIsSubmitting(true);
    try {
      await signOut();
      setMode('signin');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedAvatarMeta =
    PROFILE_AVATARS.find((a) => a.id === (profile?.avatarId ?? avatarId)) ?? PROFILE_AVATARS[0];
  const profileCountry = profile ? getCountryByCode(profile.countryCode) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Pixel Afterglow Player Account"
      data-testid="auth-profile-modal"
    >
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-1.5rem)] flex flex-col bg-[#201A36] border-2 border-[#56E0CB]/65 rounded-2xl shadow-[0_0_44px_rgba(86,224,203,0.18)] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-[#171329] border-b border-[#3D345F] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-[#FFC66D] shrink-0" />
            <h2 className="font-['Press_Start_2P'] text-[10px] sm:text-xs text-[#FFF0D7] uppercase tracking-wider truncate">
              {mode === 'signin'
                ? 'Player Sign In'
                : mode === 'register'
                ? 'Create Account'
                : mode === 'forgot'
                ? 'Reset Password'
                : mode === 'complete-profile'
                ? 'Complete Profile'
                : 'Player Profile'}
            </h2>
          </div>
          {mode !== 'complete-profile' && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close account modal"
              data-testid="close-auth-modal"
              className="p-1 rounded-lg hover:bg-[#292342] text-[#FFF0D7]/75 hover:text-[#FFF0D7] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-4 sm:p-5 space-y-3.5 overflow-y-auto arcade-scrollbar flex-1 min-h-0">
          {/* Guest Upgrade Notice */}
          {isAnonymous && (mode === 'signin' || mode === 'register') && (
            <div
              className="p-3 rounded-xl bg-[#FFC66D]/12 border border-[#FFC66D]/45 text-xs text-[#FFF0D7]/90"
              data-testid="guest-upgrade-banner"
            >
              <strong className="text-[#FFC66D]">Playing as Guest:</strong> Register or continue
              with Google to upgrade this session into a permanent Pixel Afterglow account while
              keeping your active player ID.
            </div>
          )}

          {/* Error & Info Banners */}
          {errorMsg && (
            <div
              role="alert"
              data-testid="auth-error-banner"
              className="p-3 rounded-xl bg-[#FF776E]/15 border border-[#FF776E] text-xs text-[#FFF0D7] flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-[#FF776E] shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {infoMsg && (
            <div
              role="status"
              data-testid="auth-info-banner"
              className="p-3 rounded-xl bg-[#56E0CB]/15 border border-[#56E0CB] text-xs text-[#56E0CB] flex items-start gap-2"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          {/* SIGN IN / REGISTER TABS */}
          {(mode === 'signin' || mode === 'register') && (
            <>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#171329] rounded-xl border border-[#3D345F]">
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setErrorMsg(null);
                    setInfoMsg(null);
                    setMode('signin');
                  }}
                  data-testid="auth-tab-signin"
                  className={`py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    mode === 'signin'
                      ? 'bg-[#56E0CB] text-[#171329]'
                      : 'text-[#FFF0D7]/70 hover:text-[#FFF0D7]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playClick();
                    setErrorMsg(null);
                    setInfoMsg(null);
                    setMode('register');
                  }}
                  data-testid="auth-tab-register"
                  className={`py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                    mode === 'register'
                      ? 'bg-[#FF776E] text-[#171329]'
                      : 'text-[#FFF0D7]/70 hover:text-[#FFF0D7]'
                  }`}
                >
                  Register
                </button>
              </div>

              {/* Google Sign-In Button */}
              <button
                type="button"
                onClick={() => void handleGoogleAuth()}
                disabled={isSubmitting}
                data-testid="google-signin-btn"
                className="w-full py-2.5 px-4 rounded-xl bg-[#FFF0D7] hover:bg-white text-[#171329] text-xs sm:text-sm font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-[#3B82F6]" />
                )}
                <span>Continue with Google</span>
              </button>

              <div className="flex items-center gap-2 text-[10px] text-[#FFF0D7]/45 uppercase tracking-wider">
                <div className="h-px flex-1 bg-[#3D345F]" />
                <span>or with email</span>
                <div className="h-px flex-1 bg-[#3D345F]" />
              </div>
            </>
          )}

          {/* SIGN IN FORM */}
          {mode === 'signin' && (
            <form onSubmit={(e) => void handleEmailSignIn(e)} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#56E0CB] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="player@arcade.com"
                    data-testid="auth-signin-email"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-xs sm:text-sm text-[#FFF0D7] outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      playClick();
                      setErrorMsg(null);
                      setInfoMsg(null);
                      setMode('forgot');
                    }}
                    data-testid="auth-forgot-link"
                    className="text-[11px] text-[#FFC66D] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#56E0CB] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    data-testid="auth-signin-password"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-xs sm:text-sm text-[#FFF0D7] outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="auth-signin-submit"
                className="w-full py-3 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] font-['Press_Start_2P'] text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          )}

          {/* REGISTER FORM */}
          {mode === 'register' && (
            <form onSubmit={(e) => void handleRegister(e)} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                    Arcade Username *
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-[#FFC66D] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      maxLength={20}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. PixelHero_99"
                      data-testid="auth-register-username"
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#FFC66D] focus:shadow-[0_0_0_3px_rgba(255,198,109,0.14)] text-xs sm:text-sm text-[#FFF0D7] outline-none transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                    Email Address *
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-[#56E0CB] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="player@arcade.com"
                      data-testid="auth-register-email"
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] focus:shadow-[0_0_0_3px_rgba(86,224,203,0.14)] text-xs sm:text-sm text-[#FFF0D7] outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 8 chars"
                      data-testid="auth-register-password"
                      className="w-full pl-3 pr-9 py-2 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] focus:shadow-[0_0_0_3px_rgba(86,224,203,0.14)] text-xs sm:text-sm text-[#FFF0D7] outline-none transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      data-testid="auth-toggle-password-visibility"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#FFF0D7]/60 hover:text-[#56E0CB] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                    Confirm Password *
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    data-testid="auth-register-confirm-password"
                    className="w-full px-3 py-2 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] focus:shadow-[0_0_0_3px_rgba(86,224,203,0.14)] text-xs sm:text-sm text-[#FFF0D7] outline-none transition-all"
                  />
                </div>
              </div>

              {/* Live Password Criteria Indicator */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] px-1" aria-live="polite">
                <span className={password.length >= 8 ? 'text-[#56E0CB] font-semibold' : 'text-[#FFF0D7]/55'}>
                  {password.length >= 8 ? '✓' : '○'} At least 8 characters
                </span>
                <span
                  className={
                    confirmPassword.length > 0 && password === confirmPassword
                      ? 'text-[#56E0CB] font-semibold'
                      : 'text-[#FFF0D7]/55'
                  }
                >
                  {confirmPassword.length > 0 && password === confirmPassword ? '✓' : '○'} Passwords match
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                  Country *
                </label>
                <CountrySelector value={countryCode} onChange={setCountryCode} />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1.5">
                  Pixel Avatar
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                  {PROFILE_AVATARS.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => setAvatarId(av.id)}
                      title={av.label}
                      aria-label={`Select ${av.label} avatar`}
                      data-testid={`avatar-option-${av.id}`}
                      className={`p-1.5 rounded-xl border-2 flex items-center justify-center cursor-pointer transition-all ${
                        avatarId === av.id
                          ? 'bg-[#292342] border-[#FFC66D] shadow-[0_0_12px_rgba(255,198,109,0.25)] scale-105'
                          : 'bg-[#171329] border-[#3D345F] hover:border-[#56E0CB]/50'
                      }`}
                    >
                      <MemorySymbolIcon symbolId={av.id} color={av.color} className="w-6 h-6" />
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="auth-register-submit"
                className="w-full py-2.5 rounded-xl bg-[#FF776E] hover:bg-[#ff8d85] text-[#171329] font-['Press_Start_2P'] text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50 shadow-[0_0_18px_rgba(255,119,110,0.3)]"
              >
                {isSubmitting ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}

          {/* FORGOT PASSWORD FORM */}
          {mode === 'forgot' && (
            <form onSubmit={(e) => void handleForgotPassword(e)} className="space-y-3">
              <p className="text-xs text-[#FFF0D7]/80 leading-relaxed">
                Enter the email address associated with your Pixel Afterglow account and we will
                send a password reset link.
              </p>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="player@arcade.com"
                  data-testid="auth-forgot-email"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#FFC66D] text-xs sm:text-sm text-[#FFF0D7] outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="auth-forgot-submit"
                className="w-full py-3 rounded-xl bg-[#FFC66D] hover:bg-[#ffd285] text-[#171329] font-['Press_Start_2P'] text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="w-full py-2 text-xs text-[#56E0CB] hover:underline cursor-pointer"
              >
                Back to Sign In
              </button>
            </form>
          )}

          {/* COMPLETE PROFILE (required after Google sign-in if no Firestore profile yet) */}
          {mode === 'complete-profile' && (
            <form onSubmit={(e) => void handleCompleteProfile(e)} className="space-y-3">
              <p className="text-xs text-[#FFF0D7]/80 leading-relaxed">
                Choose your unique Pixel Afterglow username, country, and arcade avatar to finish
                setting up your player profile.
              </p>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                  Unique Username *
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. NeonPlayer"
                  data-testid="complete-profile-username"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-xs sm:text-sm text-[#FFF0D7] outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                  Country *
                </label>
                <CountrySelector value={countryCode} onChange={setCountryCode} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1.5">
                  Pixel Avatar
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {PROFILE_AVATARS.map((av) => (
                    <button
                      key={av.id}
                      type="button"
                      onClick={() => setAvatarId(av.id)}
                      className={`p-2 rounded-xl border-2 flex items-center justify-center cursor-pointer ${
                        avatarId === av.id
                          ? 'bg-[#292342] border-[#FFC66D]'
                          : 'bg-[#171329] border-[#3D345F]'
                      }`}
                    >
                      <MemorySymbolIcon symbolId={av.id} color={av.color} className="w-7 h-7" />
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                data-testid="complete-profile-submit"
                className="w-full py-3 rounded-xl bg-[#56E0CB] hover:bg-[#6eead8] text-[#171329] font-['Press_Start_2P'] text-[10px] sm:text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Save & Continue'}
              </button>
            </form>
          )}

          {/* PROFILE VIEW & EDIT */}
          {mode === 'profile' && profile && (
            <div className="space-y-4" data-testid="user-profile-view">
              <div className="flex items-center gap-3.5 p-3.5 rounded-xl bg-[#171329] border border-[#3D345F]">
                <div className="w-14 h-14 rounded-xl bg-[#292342] border-2 border-[#FFC66D] flex items-center justify-center shrink-0">
                  <MemorySymbolIcon
                    symbolId={selectedAvatarMeta.id}
                    color={selectedAvatarMeta.color}
                    className="w-9 h-9"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-['Press_Start_2P'] text-xs text-[#FFF0D7] truncate">
                    {profile.username}
                  </p>
                  <p className="text-xs text-[#56E0CB] font-semibold mt-1 flex items-center gap-1.5">
                    <span>{profileCountry?.flag ?? '🏳️'}</span>
                    <span>
                      {profile.countryName} ({profile.countryCode})
                    </span>
                  </p>
                  {profile.email && (
                    <p className="text-[11px] text-[#FFF0D7]/60 truncate mt-0.5">{profile.email}</p>
                  )}
                </div>
              </div>

              {/* Email verification prompt for unverified password accounts */}
              {user && !user.emailVerified && profile.authProvider === 'password' && (
                <div className="p-2.5 rounded-xl bg-[#FFC66D]/12 border border-[#FFC66D]/45 flex items-center justify-between gap-2 text-xs">
                  <span className="text-[#FFC66D]">Email not yet verified.</span>
                  <button
                    type="button"
                    onClick={() => void handleResendVerification()}
                    disabled={isSubmitting}
                    className="px-2.5 py-1 rounded-lg bg-[#171329] border border-[#FFC66D]/50 text-[#FFC66D] font-bold text-[10px] cursor-pointer"
                  >
                    Resend Link
                  </button>
                </div>
              )}

              {/* Future-Ready Arcade Records Summary */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-[#171329] border border-[#3D345F]">
                  <p className="font-['Press_Start_2P'] text-xs text-[#56E0CB]">
                    {profile.stats?.gamesPlayed ?? 0}
                  </p>
                  <p className="text-[10px] text-[#FFF0D7]/60 mt-1">Played</p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#171329] border border-[#3D345F]">
                  <p className="font-['Press_Start_2P'] text-xs text-[#FFC66D]">
                    {profile.stats?.gamesWon ?? 0}
                  </p>
                  <p className="text-[10px] text-[#FFF0D7]/60 mt-1 flex items-center justify-center gap-1">
                    <Trophy className="w-2.5 h-2.5" /> Wins
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-[#171329] border border-[#3D345F]">
                  <p className="font-['Press_Start_2P'] text-xs text-[#FF776E]">
                    {profile.stats?.gamesLost ?? 0}
                  </p>
                  <p className="text-[10px] text-[#FFF0D7]/60 mt-1">Losses</p>
                </div>
              </div>

              {isEditingProfile ? (
                <form onSubmit={(e) => void handleUpdateProfile(e)} className="space-y-3 pt-2 border-t border-[#3D345F]">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                      Username
                    </label>
                    <input
                      type="text"
                      maxLength={20}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      data-testid="edit-profile-username"
                      className="w-full px-3 py-2 rounded-xl bg-[#171329] border-2 border-[#3D345F] focus:border-[#56E0CB] text-xs text-[#FFF0D7] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1">
                      Country
                    </label>
                    <CountrySelector value={countryCode} onChange={setCountryCode} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-[#FFF0D7]/75 mb-1.5">
                      Pixel Avatar
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {PROFILE_AVATARS.map((av) => (
                        <button
                          key={av.id}
                          type="button"
                          onClick={() => setAvatarId(av.id)}
                          className={`p-2 rounded-xl border-2 flex items-center justify-center cursor-pointer ${
                            avatarId === av.id
                              ? 'bg-[#292342] border-[#FFC66D]'
                              : 'bg-[#171329] border-[#3D345F]'
                          }`}
                        >
                          <MemorySymbolIcon symbolId={av.id} color={av.color} className="w-6 h-6" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingProfile(false)}
                      className="px-3 py-2 rounded-xl bg-[#171329] text-xs text-[#FFF0D7]/75 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      data-testid="save-profile-btn"
                      className="px-4 py-2 rounded-xl bg-[#56E0CB] text-[#171329] text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#3D345F]">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(true)}
                    data-testid="edit-profile-btn"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#292342] hover:bg-[#332B54] border border-[#56E0CB]/40 text-[#56E0CB] text-xs font-bold cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    disabled={isSubmitting}
                    data-testid="signout-btn"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FF776E]/15 hover:bg-[#FF776E]/25 border border-[#FF776E]/50 text-[#FF776E] text-xs font-bold cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              )}

              <p className="text-[10px] text-[#FFF0D7]/40 flex items-center gap-1">
                <KeyRound className="w-3 h-3 shrink-0" />
                Account ID: <span className="font-mono truncate">{profile.uid}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
