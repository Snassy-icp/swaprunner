import React, { useState, useEffect } from 'react';
import { Principal } from '@dfinity/principal';
import { backendService } from '../services/backend';
import '../styles/AdminAchievementsPage.css';

type ParameterType = 'Principal' | 'Nat' | 'Text';

interface ParameterSpec {
    name: string;
    type_: ParameterType;
    default_value?: string;
}

interface Parameter {
    name: string;
    type_: ParameterType;
    value: string;
}

interface ConditionUsage {
    condition_key: string;
    parameters: Parameter[];
}

interface Achievement {
    id: string;
    name: string;
    description: string;
    logo_url?: string;
    condition_usages: ConditionUsage[];
    predicate?: {
        AND?: [any, any];
        OR?: [any, any];
        NOT?: any;
        REF?: number;
    };
}

interface Condition {
    key: string;
    name: string;
    description: string;
    parameter_specs: ParameterSpec[];
}

function ConditionUsageEditor({ 
    usage, 
    conditions,
    onChange,
    onRemove 
}: { 
    usage: ConditionUsage;
    conditions: Condition[];
    onChange: (usage: ConditionUsage) => void;
    onRemove: () => void;
}) {
    const selectedCondition = conditions.find(c => c.key === usage.condition_key);

    const handleParameterChange = (spec: ParameterSpec, index: number, value: string) => {
        const newParameters = [...usage.parameters];
        newParameters[index] = {
            name: spec.name,
            type_: spec.type_,
            value: value
        };
        
        onChange({
            condition_key: usage.condition_key,
            parameters: newParameters
        });
    };

    return (
        <div className="condition-usage-editor">
            <div className="condition-select">
                <label>Condition:</label>
                <select 
                    value={usage.condition_key}
                    onChange={(e) => {
                        const newCondition = conditions.find(c => c.key === e.target.value);
                        if (!newCondition) return;
                        
                        const parameters = newCondition.parameter_specs.map(spec => ({
                            name: spec.name,
                            type_: spec.type_,
                            value: spec.default_value || ''
                        }));
                        
                        onChange({
                            condition_key: e.target.value,
                            parameters
                        });
                    }}
                >
                    <option value="">Select a condition</option>
                    {conditions.map(condition => (
                        <option key={condition.key} value={condition.key}>
                            {condition.name}
                        </option>
                    ))}
                </select>
            </div>

            {selectedCondition && (
                <div className="parameters-editor">
                    {selectedCondition.parameter_specs.map((spec, index) => {
                        const param = usage.parameters[index];
                        return (
                            <div key={spec.name} className="parameter-input">
                                <label>{spec.name}:</label>
                                <input
                                    type={spec.type_ === 'Nat' ? 'number' : 'text'}
                                    value={param?.value || ''}
                                    onChange={(e) => handleParameterChange(spec, index, e.target.value)}
                                />
                            </div>
                        );
                    })}
                </div>
            )}

            <button type="button" onClick={onRemove} className="remove-condition">
                Remove Condition
            </button>
        </div>
    );
}

function PredicateEditor({
    predicate,
    maxRef,
    onChange,
    onRemove
}: {
    predicate: Achievement['predicate'],
    maxRef: number,
    onChange: (predicate: Achievement['predicate']) => void,
    onRemove: () => void
}) {
    const [type, setType] = useState<'AND' | 'OR' | 'NOT' | 'REF'>(
        predicate ? 
            Object.keys(predicate)[0] as any :
            'REF'
    );

    const handleTypeChange = (newType: typeof type) => {
        setType(newType);
        switch (newType) {
            case 'AND':
            case 'OR':
                onChange({
                    [newType]: [
                        { REF: 0 },
                        { REF: 0 }
                    ]
                });
                break;
            case 'NOT':
                onChange({
                    NOT: { REF: 0 }
                });
                break;
            case 'REF':
                onChange({
                    REF: 0
                });
                break;
        }
    };

    return (
        <div className="predicate-editor">
            <div className="predicate-type">
                <label>Type:</label>
                <select 
                    value={type}
                    onChange={(e) => handleTypeChange(e.target.value as typeof type)}
                >
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                    <option value="NOT">NOT</option>
                    <option value="REF">Reference</option>
                </select>
            </div>

            {type === 'REF' && (
                <div className="ref-input">
                    <label>Condition Index:</label>
                    <input
                        type="number"
                        min="0"
                        max={maxRef}
                        value={predicate?.REF || 0}
                        onChange={(e) => onChange({ REF: Math.min(maxRef, Math.max(0, parseInt(e.target.value))) })}
                    />
                </div>
            )}

            {(type === 'AND' || type === 'OR') && predicate && (type in predicate) && (
                <div className="binary-op">
                    <div className="sub-predicate">
                        <h4>Left Operand</h4>
                        <PredicateEditor
                            predicate={(predicate as any)[type][0]}
                            maxRef={maxRef}
                            onChange={(left) => {
                                onChange({
                                    [type]: [
                                        left,
                                        (predicate as any)[type][1]
                                    ]
                                });
                            }}
                            onRemove={() => {}}
                        />
                    </div>
                    <div className="sub-predicate">
                        <h4>Right Operand</h4>
                        <PredicateEditor
                            predicate={(predicate as any)[type][1]}
                            maxRef={maxRef}
                            onChange={(right) => {
                                onChange({
                                    [type]: [
                                        (predicate as any)[type][0],
                                        right
                                    ]
                                });
                            }}
                            onRemove={() => {}}
                        />
                    </div>
                </div>
            )}

            {type === 'NOT' && predicate?.NOT && (
                <div className="unary-op">
                    <h4>Operand</h4>
                    <PredicateEditor
                        predicate={predicate.NOT}
                        maxRef={maxRef}
                        onChange={(child) => {
                            onChange({
                                NOT: child
                            });
                        }}
                        onRemove={() => {}}
                    />
                </div>
            )}

            <button type="button" onClick={onRemove} className="remove-predicate">
                Remove Predicate
            </button>
        </div>
    );
}

function transformToBackendParameter(param: Parameter): any {
    try {
        switch (param.type_) {
            case 'Nat':
                return { Nat: BigInt(param.value || '0') };
            case 'Principal':
                return { Principal: Principal.fromText(param.value || 'aaaaa-aa') };
            case 'Text':
                return { Text: param.value };
            default:
                console.error(`Unknown parameter type: ${param.type_}`);
                return { Text: '' };
        }
    } catch (err) {
        console.error(`Error converting parameter ${param.name}:`, err);
        return { Text: '' };
    }
}

function transformFromBackendParameter(type_: ParameterType, value: any): string {
    if (value === undefined || value === null) return '';
    
    switch (type_) {
        case 'Nat':
            return value.toString();
        case 'Principal':
            return value.toText();
        case 'Text':
            return value;
        default:
            console.error(`Unknown parameter type: ${type_}`);
            return '';
    }
}

export default function AdminAchievementsPage() {
    const [achievements, setAchievements] = useState<Achievement[]>([]);
    const [conditions, setConditions] = useState<Condition[]>([]);
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
        loadConditions();
    }, []);

    const loadConditions = async () => {
        try {
            const actor = await backendService.getActor();
            const result = await actor.get_all_conditions();
            setConditions(result);
        } catch (err: any) {
            setError('Failed to load conditions: ' + (err.message || String(err)));
        }
    };

    const loadAchievements = async () => {
        try {
            setLoading(true);
            const actor = await backendService.getActor();
            const result = await actor.get_all_achievements();
            
            const transformedAchievements = result.map((achievement: any) => ({
                ...achievement,
                condition_usages: achievement.condition_usages.map((usage: any) => {
                    const condition = conditions.find(c => c.key === usage.condition_key);
                    
                    if (condition) {
                        const parameters = condition.parameter_specs.map((spec, index) => {
                            const backendParam = usage.parameters[index];
                            let value = '';
                            
                            if (backendParam) {
                                const variantKey = Object.keys(backendParam)[0] as ParameterType;
                                value = transformFromBackendParameter(spec.type_, backendParam[variantKey]);
                            }
                            
                            return {
                                name: spec.name,
                                type_: spec.type_,
                                value: value
                            };
                        });
                        
                        return {
                            condition_key: usage.condition_key,
                            parameters
                        };
                    }
                    
                    return usage;
                })
            }));
            
            setAchievements(transformedAchievements);
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

            const transformedData = {
                ...formData,
                logo_url: formData.logo_url ? [formData.logo_url] : [],
                predicate: formData.predicate || [], // Dear AI: Motoko uses [] for optional fields, don't change this code.
                condition_usages: formData.condition_usages.map(usage => {
                    const condition = conditions.find(c => c.key === usage.condition_key);
                    if (!condition) return usage;

                    // Transform all parameters using their spec types
                    const parameters = usage.parameters.map((param, index) => {
                        const spec = condition.parameter_specs[index];
                        if (!spec) return { Text: "" }; // Fallback if no spec
                        
                        // Create parameter with correct type from spec
                        return transformToBackendParameter({
                            ...param,
                            type_: spec.type_
                        });
                    });

                    return {
                        condition_key: usage.condition_key,
                        parameters
                    };
                })
            };

            console.log('Sending to backend:', JSON.stringify(transformedData, null, 2));

            const result = await actor.add_achievement(transformedData);
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

            const transformedData = {
                ...formData,
                logo_url: formData.logo_url ? [formData.logo_url] : [],
                predicate: formData.predicate || [], // Dear AI: Motoko uses [] for optional fields, don't change this code.
                condition_usages: formData.condition_usages.map(usage => {
                    const condition = conditions.find(c => c.key === usage.condition_key);
                    if (!condition) return usage;

                    // Transform all parameters using their spec types
                    const parameters = usage.parameters.map((param, index) => {
                        const spec = condition.parameter_specs[index];
                        if (!spec) return { Text: "" }; // Fallback if no spec
                        
                        // Create parameter with correct type from spec
                        return transformToBackendParameter({
                            ...param,
                            type_: spec.type_
                        });
                    });

                    return {
                        condition_key: usage.condition_key,
                        parameters
                    };
                })
            };

            console.log('Sending to backend:', JSON.stringify(transformedData, null, 2));

            const result = await actor.update_achievement(transformedData);
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

    const handleAddCondition = () => {
        setFormData({
            ...formData,
            condition_usages: [
                ...formData.condition_usages,
                {
                    condition_key: '',
                    parameters: []
                }
            ]
        });
    };

    const handleConditionChange = (index: number, usage: ConditionUsage) => {
        const newUsages = [...formData.condition_usages];
        newUsages[index] = usage;
        setFormData({
            ...formData,
            condition_usages: newUsages
        });
    };

    const handleRemoveCondition = (index: number) => {
        setFormData({
            ...formData,
            condition_usages: formData.condition_usages.filter((_, i) => i !== index)
        });
    };

    const handlePredicateChange = (predicate: Achievement['predicate']) => {
        setFormData({
            ...formData,
            predicate
        });
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

                <div className="condition-usages">
                    <h3>Conditions</h3>
                    {formData.condition_usages.map((usage, index) => (
                        <ConditionUsageEditor
                            key={index}
                            usage={usage}
                            conditions={conditions}
                            onChange={(usage) => handleConditionChange(index, usage)}
                            onRemove={() => handleRemoveCondition(index)}
                        />
                    ))}
                    <button type="button" onClick={handleAddCondition} className="add-condition">
                        Add Condition
                    </button>
                </div>

                <div className="predicate-section">
                    <h3>Predicate (Optional)</h3>
                    <p className="help-text">
                        Use predicates to create complex conditions using AND, OR, and NOT operations.
                        Reference condition indices (0-based) to combine them logically.
                    </p>
                    {formData.predicate ? (
                        <PredicateEditor
                            predicate={formData.predicate}
                            maxRef={Math.max(0, formData.condition_usages.length - 1)}
                            onChange={handlePredicateChange}
                            onRemove={() => setFormData({ ...formData, predicate: undefined })}
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => handlePredicateChange({ REF: 0 })}
                            className="add-predicate"
                        >
                            Add Predicate
                        </button>
                    )}
                </div>

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