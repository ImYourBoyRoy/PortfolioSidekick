// ./sidekick/src/app/components/modals/ProfileModal.jsx
/**
 * Extracted from App.jsx — state via useSidekick().
 * Created by: Roy Dawson IV
 */
import { User, X } from 'lucide-react';
import { useShell, useProfiles } from '../../context/SidekickContext';

export default function ProfileModal() {
  const shell = useShell();
  const s = useProfiles();

  if (!shell.isProfileModalOpen) return null;

  return (
        <div className="modal-overlay">
          <div className="glass-card modal-card">
            <button 
              onClick={() => shell.setIsProfileModalOpen(false)}
              className="modal-close-btn"
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 24 }}>
              <div className="modal-icon-container" style={{ backgroundColor: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                <User className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="modal-title">Create New Profile</h3>
              <p className="modal-subtitle">Add a custom profile dynamically to track a separate portfolio and prediction record offline.</p>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              s.handleCreateProfile(shell.modalProfileName, false);
            }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="input-group">
                <label className="input-label">Profile Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Portfolio, Swing Account, or Long-Term"
                  value={shell.modalProfileName}
                  onChange={(e) => shell.setModalProfileName(e.target.value)}
                  className="form-input-text"
                />
              </div>

              <button
                type="submit"
                className="btn-primary"
                style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
              >
                Create Profile
              </button>


            </form>
          </div>
        </div>
  );
}
