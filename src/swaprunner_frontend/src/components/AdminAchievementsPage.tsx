import React, { useState, useEffect } from 'react';
import { Principal } from '@dfinity/principal';
import { backendService } from '../services/backend';
import '../styles/AdminAchievementsPage.css';

interface Achievement {
    id: string;
    name: string;
    description: string;
    logo_url?: string;
    condition_usages: Array<{
        condition_key: string;
        parameters: {
            Principal?: Principal;
            Nat?: bigint;
            Text?: string;
        };
    }>;
    predicate?: {
        AND?: [any, any];
        OR?: [any, any];
        NOT?: any;
        REF?: number;
    };
}

export default function AdminAchievementsPage() {
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);

    // Form state
    const [formData, setFormData] = useState<Achievement>({
        id: '',
        name: '',
        description: '',
        condition_usages: [],
    });

    useEffect(() => {
        loadAchievements();
    }, []);

    const loadAchievements = async () => {
        try {
            setLoading(true);
            const actor = await backendService.getActor();
            const result = await actor.get_all_achievements();
            setAchievements(result);
            setError(null);
        } catch (err: any) {
            setError('Failed to load achievements: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const actor = await backendService.getActor();
            const result = await actor.add_achievement(formData);
            if ('ok' in result) {
                await loadAchievements();
                setFormData({
                    id: '',
                    name: '',
                    description: '',
                    condition_usages: [],
                });
                setError(null);
            } else {
                setError(result.err);
            }
        } catch (err: any) {
            setError('Failed to add achievement: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this achievement?')) {
            return;
        }
        try {
            setLoading(true);
            const actor = await backendService.getActor();
            const result = await actor.remove_achievement(id);
            if ('ok' in result) {
                await loadAchievements();
                setError(null);
            } else {
                setError(result.err);
            }
        } catch (err: any) {
            setError('Failed to delete achievement: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (achievement: Achievement) => {
        setSelectedAchievement(achievement);
        setFormData(achievement);
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setLoading(true);
            const actor = await backendService.getActor();
            const result = await actor.update_achievement(formData);
            if ('ok' in result) {
                await loadAchievements();
                setSelectedAchievement(null);
                setFormData({
                    id: '',
                    name: '',
                    description: '',
                    condition_usages: [],
                });
                setError(null);
            } else {
                setError(result.err);
            }
        } catch (err: any) {
            setError('Failed to update achievement: ' + (err.message || String(err)));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-achievements-page">
            <h1>Manage Achievements</h1>
            
            {error && <div className="error-message">{error}</div>}
            
            <form onSubmit={selectedAchievement ? handleUpdate : handleSubmit} className="achievement-form">
                <h2>{selectedAchievement ? 'Edit Achievement' : 'Add New Achievement'}</h2>
                
                <div className="form-group">
                    <label htmlFor="id">ID:</label>
                    <input
                        type="text"
                        id="id"
                        value={formData.id}
                        onChange={(e) => setFormData({...formData, id: e.target.value})}
                        required
                        disabled={!!selectedAchievement}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="name">Name:</label>
                    <input
                        type="text"
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="description">Description:</label>
                    <textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                        required
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="logo_url">Logo URL (optional):</label>
                    <input
                        type="text"
                        id="logo_url"
                        value={formData.logo_url || ''}
                        onChange={(e) => setFormData({...formData, logo_url: e.target.value})}
                    />
                </div>

                {/* TODO: Add condition usage and predicate editors */}
                
                <div className="form-actions">
                    <button type="submit" disabled={loading}>
                        {selectedAchievement ? 'Update Achievement' : 'Add Achievement'}
                    </button>
                    {selectedAchievement && (
                        <button 
                            type="button" 
                            onClick={() => {
                                setSelectedAchievement(null);
                                setFormData({
                                    id: '',
                                    name: '',
                                    description: '',
                                    condition_usages: [],
                                });
                            }}
                        >
                            Cancel Edit
                        </button>
                    )}
                </div>
            </form>

            <div className="achievements-list">
                <h2>Existing Achievements</h2>
                {loading ? (
                    <div>Loading...</div>
                ) : (
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {achievements.map((achievement) => (
                                <tr key={achievement.id}>
                                    <td>{achievement.id}</td>
                                    <td>{achievement.name}</td>
                                    <td>{achievement.description}</td>
                                    <td>
                                        <button onClick={() => handleEdit(achievement)}>Edit</button>
                                        <button onClick={() => handleDelete(achievement.id)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
} 