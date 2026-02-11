'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, AlertTriangle, Calendar, CheckCircle, X, Edit2, Save, Trash2, Square, CheckSquare } from 'lucide-react';

interface DailySummary {
  id: string;
  date: string;
  summary: string;
  riskLevel: number;
  keyInsights: string[];
}

interface RoutineActivity {
  time: string;
  activity: string;
  expectedBenefit: string;
  completed?: boolean;
}

interface Routine {
  id: string;
  targetDate: string;
  activities: RoutineActivity[];
}

interface AgenticDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AgenticDashboard({ isOpen, onClose }: AgenticDashboardProps) {
  const [activeTab, setActiveTab] = useState<'audit' | 'routine'>('audit');
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Edit Mode State
  const [isEditingRoutine, setIsEditingRoutine] = useState(false);
  const [editedActivities, setEditedActivities] = useState<RoutineActivity[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Audit
      const auditRes = await fetch(`/api/agents/audit?date=${date}`);
      if (auditRes.ok) {
        setSummary(await auditRes.json());
      } else {
        setSummary(null);
      }

      // Fetch Routine
      const routineRes = await fetch(`/api/agents/routine?date=${date}`);
      if (routineRes.ok) {
        const data = await routineRes.json();
        setRoutine(data);
        setEditedActivities(data.activities);
      } else {
        setRoutine(null);
        setEditedActivities([]);
      }
    } catch (error) {
      console.error("Failed to fetch agentic data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setIsEditingRoutine(false);
    }
  }, [isOpen, date]);

  const getRiskColor = (level: number) => {
    if (level <= 3) return 'text-green-400';
    if (level <= 7) return 'text-yellow-400';
    return 'text-red-400';
  };

  const handleGenerateAudit = async () => {
    setLoading(true);
    try {
        await fetch('/api/agents/audit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date })
        });
        await fetchData();
    } catch (error) {
        console.error("Failed to generate audit", error);
    } finally {
        setLoading(false);
    }
  };

  const handleGenerateRoutine = async () => {
    setLoading(true);
    try {
        await fetch('/api/agents/routine', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date })
        });
        await fetchData();
    } catch (error) {
        console.error("Failed to generate routine", error);
    } finally {
        setLoading(false);
    }
  };

  const handleSaveRoutine = async (activitiesToSave = editedActivities) => {
    setLoading(true);
    try {
        const res = await fetch(`/api/agents/routine?date=${date}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activities: activitiesToSave })
        });
        
        if (res.ok) {
            setIsEditingRoutine(false);
            await fetchData();
        }
    } catch (error) {
        console.error("Failed to update routine", error);
    } finally {
        setLoading(false);
    }
  };

  const toggleCompletion = async (index: number) => {
    if (!routine) return;
    const newActivities = [...routine.activities];
    newActivities[index] = { 
        ...newActivities[index], 
        completed: !newActivities[index].completed 
    };
    
    // Optimistic update
    setRoutine({ ...routine, activities: newActivities });
    setEditedActivities(newActivities);
    
    // Save to backend
    await handleSaveRoutine(newActivities);
  };

  const updateActivity = (index: number, field: keyof RoutineActivity, value: string) => {
    const newActivities = [...editedActivities];
    newActivities[index] = { ...newActivities[index], [field]: value };
    setEditedActivities(newActivities);
  };

  const deleteActivity = (index: number) => {
    const newActivities = editedActivities.filter((_, i) => i !== index);
    setEditedActivities(newActivities);
  };

  const addActivity = () => {
    setEditedActivities([...editedActivities, { time: "00:00", activity: "New Activity", expectedBenefit: "Benefit", completed: false }]);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <Activity className="text-purple-400" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-zinc-100">Behavioral Intelligence</h2>
                  <p className="text-xs text-zinc-500">AI-Powered Recovery Assistant</p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded-lg focus:ring-purple-500 focus:border-purple-500 block p-2.5"
                />
                <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800">
              <button
                onClick={() => setActiveTab('audit')}
                className={`flex-1 py-4 text-sm font-medium transition-colors relative ${
                  activeTab === 'audit' ? 'text-purple-400 bg-zinc-800/30' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Daily Audit
                {activeTab === 'audit' && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />
                )}
              </button>
              <button
                onClick={() => setActiveTab('routine')}
                className={`flex-1 py-4 text-sm font-medium transition-colors relative ${
                  activeTab === 'routine' ? 'text-purple-400 bg-zinc-800/30' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Smart Routine
                {activeTab === 'routine' && (
                  <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-500" />
                )}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-900/50">
              {loading && !routine ? (
                <div className="flex items-center justify-center h-full text-zinc-500">Loading analysis...</div>
              ) : (
                <>
                  {activeTab === 'audit' && (
                    <div className="space-y-6">
                      {summary ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-zinc-800/50 p-4 rounded-lg border border-zinc-700/50">
                              <div className="text-zinc-500 text-xs uppercase font-bold mb-2">Risk Level</div>
                              <div className={`text-4xl font-bold ${getRiskColor(summary.riskLevel)}`}>
                                {summary.riskLevel}/10
                              </div>
                            </div>
                            <div className="col-span-2 bg-zinc-800/50 p-4 rounded-lg border border-zinc-700/50">
                              <div className="text-zinc-500 text-xs uppercase font-bold mb-2">Summary</div>
                              <p className="text-zinc-300 text-sm leading-relaxed">{summary.summary}</p>
                            </div>
                          </div>

                          <div>
                            <h3 className="text-zinc-400 text-sm font-bold uppercase mb-3 flex items-center gap-2">
                              <AlertTriangle size={16} /> Key Insights
                            </h3>
                            <div className="grid gap-3">
                              {summary.keyInsights.map((insight, i) => (
                                <div key={i} className="bg-zinc-800/30 p-3 rounded-lg border border-zinc-700/30 text-zinc-300 text-sm flex gap-3">
                                  <span className="text-purple-500 font-bold">{i + 1}.</span>
                                  {insight}
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="text-center py-20 text-zinc-500">
                          <p>No audit found for this date.</p>
                          <button 
                            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                            onClick={handleGenerateAudit}
                          >
                            Generate Audit Now
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'routine' && (
                    <div className="space-y-6">
                      {routine ? (
                        <>
                            <div className="flex justify-end mb-2">
                                {isEditingRoutine ? (
                                    <button 
                                        onClick={() => handleSaveRoutine()}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors"
                                    >
                                        <Save size={14} /> Save Changes
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => setIsEditingRoutine(true)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
                                    >
                                        <Edit2 size={14} /> Edit Routine
                                    </button>
                                )}
                            </div>

                            <div className="space-y-4">
                            {(isEditingRoutine ? editedActivities : routine.activities).map((item, i) => (
                                <div key={i} className="flex gap-4 group items-start">
                                <div className="w-24 pt-1">
                                    {isEditingRoutine ? (
                                        <input 
                                            value={item.time}
                                            onChange={(e) => updateActivity(i, 'time', e.target.value)}
                                            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm rounded px-2 py-1"
                                        />
                                    ) : (
                                        <div className="text-right text-sm font-mono text-zinc-500 group-hover:text-purple-400 transition-colors">
                                            {item.time}
                                        </div>
                                    )}
                                </div>
                                
                                <div className={`flex-1 p-4 rounded-lg border transition-colors relative ${
                                    item.completed && !isEditingRoutine 
                                        ? 'bg-green-900/10 border-green-500/30' 
                                        : 'bg-zinc-800/30 border-zinc-700/30 hover:border-purple-500/30'
                                }`}>
                                    {isEditingRoutine ? (
                                        <div className="space-y-2">
                                            <input 
                                                value={item.activity}
                                                onChange={(e) => updateActivity(i, 'activity', e.target.value)}
                                                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded px-2 py-1 font-medium"
                                                placeholder="Activity"
                                            />
                                            <input 
                                                value={item.expectedBenefit}
                                                onChange={(e) => updateActivity(i, 'expectedBenefit', e.target.value)}
                                                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs rounded px-2 py-1"
                                                placeholder="Expected Benefit"
                                            />
                                            <button 
                                                onClick={() => deleteActivity(i)}
                                                className="absolute top-2 right-2 text-zinc-600 hover:text-red-400"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-start gap-3">
                                            <button 
                                                onClick={() => toggleCompletion(i)}
                                                className={`mt-0.5 transition-colors ${item.completed ? 'text-green-500' : 'text-zinc-600 hover:text-zinc-400'}`}
                                            >
                                                {item.completed ? <CheckSquare size={20} /> : <Square size={20} />}
                                            </button>
                                            <div>
                                                <h4 className={`font-medium mb-1 ${item.completed ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                                                    {item.activity}
                                                </h4>
                                                <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                                                    <CheckCircle size={12} className="text-green-500/70" />
                                                    {item.expectedBenefit}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                </div>
                            ))}
                            
                            {isEditingRoutine && (
                                <button 
                                    onClick={addActivity}
                                    className="w-full py-2 border-2 border-dashed border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400 rounded-lg text-sm font-medium transition-colors"
                                >
                                    + Add Activity
                                </button>
                            )}
                            </div>
                        </>
                      ) : (
                        <div className="text-center py-20 text-zinc-500">
                          <p>No routine generated for this date.</p>
                          <button 
                            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                            onClick={handleGenerateRoutine}
                          >
                            Generate Routine Now
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
