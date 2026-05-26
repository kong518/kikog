/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import SubmissionForm from './components/SubmissionForm';
import AdminDashboard from './components/AdminDashboard';
import { auth } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      // In this simple app, we'll consider the user an admin if they are logged in
      // and their email matches the one from setup.
      if (user && (user.email === 'kong@suwonrehab.or.kr')) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Access admin dashboard if URL contains ?admin=true or if already logged in as admin
  const [useAdminView, setUseAdminView] = useState(false);

  useEffect(() => {
    const checkAdmin = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get('admin') === 'true') {
        setUseAdminView(true);
      } else {
        setUseAdminView(false);
      }
    };
    
    checkAdmin();
    // Also listen for potential URL changes
    window.addEventListener('popstate', checkAdmin);
    return () => window.removeEventListener('popstate', checkAdmin);
  }, []);

  const handleEnterAdmin = () => {
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?admin=true';
    window.history.pushState({ path: newUrl }, '', newUrl);
    setUseAdminView(true);
  };

  const showDashboard = isAdmin || useAdminView;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-sm font-mono animate-pulse text-slate-400 uppercase tracking-widest">시스템을 불러오는 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans">
      {showDashboard ? (
        <AdminDashboard />
      ) : (
        <SubmissionForm onAdminAccess={handleEnterAdmin} />
      )}
    </div>
  );
}

