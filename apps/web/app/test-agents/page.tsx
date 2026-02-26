'use client';

import { useState } from 'react';

interface ExecutionResponse {
    threadId?: string;
    status?: string;
    result?: any;
    message?: string;
    analysis?: any;
    routine?: any;
}

export default function TestAgentsPage() {
    const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
    const [threadId, setThreadId] = useState<string>('');
    const [status, setStatus] = useState<string>('');
    const [response, setResponse] = useState<any>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');

    const API_BASE = 'http://localhost:6060';

    const handleExecute = async (endpoint: string, agentType: string) => {
        setLoading(true);
        setError('');
        setResponse(null);
        setStatus(`Ejecutando ${agentType}...`);

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date }),
            });

            const data: ExecutionResponse = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Error en la ejecución');
            }

            setResponse(data);

            if (data.threadId) {
                setThreadId(data.threadId);
                setStatus('⏸️ Pausado - Esperando aprobación');
            } else {
                setStatus('✅ Completado');
            }
        } catch (err: any) {
            setError(err.message || 'Error desconocido');
            setStatus('❌ Error');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (approved: boolean) => {
        if (!threadId) {
            setError('No hay threadId disponible');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_BASE}/agents/approve/${threadId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ approved }),
            });

            const data: ExecutionResponse = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Error en la aprobación');
            }

            setResponse(data);
            setStatus(approved ? '✅ Aprobado - Completado' : '🚫 Rechazado');

            if (data.status === 'completed') {
                setThreadId('');
            }
        } catch (err: any) {
            setError(err.message || 'Error desconocido');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckStatus = async () => {
        if (!threadId) {
            setError('No hay threadId disponible');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const res = await fetch(`${API_BASE}/agents/status/${threadId}`);
            const data: ExecutionResponse = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Error al obtener estado');
            }

            setResponse(data);
            setStatus(`📊 Estado: ${data.status || 'Desconocido'}`);
        } catch (err: any) {
            setError(err.message || 'Error desconocido');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckData = async (endpoint: string, dataType: string) => {
        setLoading(true);
        setError('');
        setResponse(null);
        setStatus(`Verificando ${dataType}...`);

        try {
            const res = await fetch(`${API_BASE}${endpoint}/${date}`);

            if (res.status === 404) {
                setStatus(`ℹ️ No hay ${dataType.toLowerCase()} para esta fecha`);
                setResponse({ message: `No se encontró ${dataType.toLowerCase()} para ${date}` });
                return;
            }

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || `Error al verificar ${dataType.toLowerCase()}`);
            }

            setResponse(data);
            setStatus(`✅ ${dataType} encontrada`);
        } catch (err: any) {
            setError(err.message || 'Error desconocido');
            setStatus('❌ Error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                <div className="border-b border-zinc-800 pb-6">
                    <h1 className="text-3xl font-bold mb-2">🧪 Test LangGraph Agents</h1>
                    <p className="text-zinc-400">Prueba el flujo de pausa/reanudación de agentes LangGraph</p>
                </div>

                <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                    <label className="block text-sm font-medium mb-2 text-zinc-300">Fecha</label>
                    <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white"
                    />
                </div>

                <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                    <h2 className="text-xl font-semibold mb-4">Ejecutar Agentes</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={() => handleExecute('/agents/daily-audit', 'Auditoría Diaria')}
                            disabled={loading}
                            className="px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <span>📊</span>
                            <span>Auditoría Diaria</span>
                        </button>
                        <button
                            onClick={() => handleExecute('/agents/generate-routine', 'Generar Rutina')}
                            disabled={loading}
                            className="px-6 py-4 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <span>📅</span>
                            <span>Generar Rutina</span>
                        </button>
                    </div>
                </div>

                <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                    <h2 className="text-xl font-semibold mb-4">Verificar Datos Existentes</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button
                            onClick={() => handleCheckData('/agents/audit', 'Auditoría')}
                            disabled={loading}
                            className="px-6 py-4 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <span>🔍</span>
                            <span>Verificar Auditoría</span>
                        </button>
                        <button
                            onClick={() => handleCheckData('/agents/routine', 'Rutina')}
                            disabled={loading}
                            className="px-6 py-4 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                        >
                            <span>🔍</span>
                            <span>Verificar Rutina</span>
                        </button>
                    </div>
                </div>

                {threadId && (
                    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                        <h2 className="text-xl font-semibold mb-4">Aprobar/Rechazar Ejecución</h2>
                        <div className="mb-4 p-3 bg-zinc-800 rounded-lg">
                            <span className="text-sm text-zinc-400">Thread ID:</span>
                            <span className="ml-2 font-mono text-sm text-blue-400">{threadId}</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <button
                                onClick={() => handleApprove(true)}
                                disabled={loading}
                                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                            >
                                ✅ Aprobar
                            </button>
                            <button
                                onClick={() => handleApprove(false)}
                                disabled={loading}
                                className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                            >
                                ❌ Rechazar
                            </button>
                            <button
                                onClick={handleCheckStatus}
                                disabled={loading}
                                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
                            >
                                📊 Ver Estado
                            </button>
                        </div>
                    </div>
                )}

                {status && (
                    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                        <h2 className="text-xl font-semibold mb-4">Estado</h2>
                        <div className="p-4 bg-zinc-800 rounded-lg">
                            <p className="text-lg">{status}</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="bg-red-900/20 border border-red-700 p-6 rounded-lg">
                        <h2 className="text-xl font-semibold mb-4 text-red-400">Error</h2>
                        <p className="text-red-300">{error}</p>
                    </div>
                )}

                {response && (
                    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                        <h2 className="text-xl font-semibold mb-4">Resultado</h2>
                        <pre className="p-4 bg-zinc-800 rounded-lg overflow-auto text-sm text-zinc-300 max-h-96">
                            {JSON.stringify(response, null, 2)}
                        </pre>
                    </div>
                )}

                <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                    <h2 className="text-xl font-semibold mb-4">📖 Instrucciones</h2>
                    <ol className="list-decimal list-inside space-y-2 text-zinc-300">
                        <li>Selecciona una fecha para la ejecución</li>
                        <li>Haz clic en &quot;Auditoría Diaria" o "Generar Rutina&quot;</li>
                        <li>Si el riesgo es alto (≥7), la ejecución se pausará automáticamente</li>
                        <li>Usa los botones "Aprobar" o &quot;Rechazar" para continuar</li>
                        <li>Puedes verificar el estado en cualquier momento</li>
                    </ol>
                    
                    <div className="mt-4 p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                        <p className="text-yellow-200 text-sm">
                            <strong>⚠️ Nota:</strong> Asegúrate de que el API esté corriendo en http://localhost:6060
                        </p>
                    </div>
                </div>

                {loading && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
                            <div className="flex items-center gap-3">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                                <span>Procesando...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
