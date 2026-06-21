import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Activity, Zap, Mic, Send, User, FileText, Camera, HeartPulse, History, ArrowLeft, Volume2, StopCircle, ClipboardList, Pill, Utensils, Download, ArrowRight } from 'lucide-react';
import BodyMap3D from './components/BodyMap3D'; 
import LoginModal from './components/LoginModal'; 
import { saveSession, getHistory, generatePDF } from './ReportService';
import { useVoice } from './hooks/useVoice'; 
import { firstAidData } from './firstAidData';

function App() {
  const [user, setUser] = useState(null); // Now stores { name, age, weight, height, bloodGroup }
  const [view, setView] = useState('dashboard'); 
  const [panelMode, setPanelMode] = useState('3d'); 
  const [panelContent, setPanelContent] = useState(null); 
  const [messages, setMessages] = useState([{ role: 'bot', text: 'Hello! I am Dr.Care. I am ready to help.' }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyData, setHistoryData] = useState([]); 

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null); 
  const { isListening, isSpeaking, listen, speak, stopSpeaking } = useVoice();

  useEffect(() => {
    if (view === 'history') setHistoryData(getHistory());
  }, [view]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // --- UPDATED LOGIN HANDLER ---
  const handleLogin = (userData) => {
    setUser(userData); // Save all fields (weight, height, etc.)
  };

  const renderFormattedText = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, index) => {
      if (line.includes('**')) {
        const parts = line.split('**');
        return <div key={index} className="mt-2 mb-1">{parts.map((part, i) => i % 2 === 1 ? <strong key={i} className="text-teal-700 font-bold block">{part}</strong> : part)}</div>;
      }
      if (line.trim().startsWith('-') || line.trim().startsWith('*')) {
        return <div key={index} className="ml-2 mb-1 flex gap-2"><span className="text-teal-500 font-bold">•</span><span className="text-slate-700">{line.replace(/[-*]/, '').trim()}</span></div>;
      }
      return <p key={index} className="mb-1 leading-relaxed">{line}</p>;
    });
  };

  const handleSend = async (manualText = null) => {
    const textToSend = manualText || input;
    if (!textToSend.trim()) return;

    const userMessage = { role: 'user', text: textToSend };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // INJECT NEW DETAILS INTO CONTEXT FOR AI
      const promptWithContext = `${textToSend} \n(Context: Patient Age: ${user.age}, Weight: ${user.weight}kg, Height: ${user.height}cm, Blood Group: ${user.bloodGroup})`;

      const response = await axios.post(`${import.meta.env.VITE_API_URL}/symptoms/analyze`, { 
        user_name: user.name, 
        text: promptWithContext 
      });
      const botResponse = response.data.diagnosis;

      let historyType = 'General Analysis';
      if (panelMode === 'diet') historyType = 'Diet Plan';
      if (panelMode === 'medicine') historyType = 'Medicine Guide';
      if (panelMode === 'diagnosis') historyType = 'Deep Diagnosis';

      if (['diagnosis', 'medicine', 'diet'].includes(panelMode)) {
        setPanelContent(prev => ({ ...prev, text: botResponse }));
        setMessages(prev => [...prev, { role: 'bot', text: "I have updated the results on the Main Screen." }]);
        speak("Results updated.");
      } else {
        setMessages(prev => [...prev, { role: 'bot', text: botResponse }]);
        speak(botResponse);
      }
      
      // PASS USER DETAILS TO SAVE SESSION
      saveSession(textToSend, botResponse, historyType, user); 

    } catch (error) {
      setMessages(prev => [...prev, { role: 'bot', text: "Error connecting to AI." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMicClick = () => { listen((transcript) => { setInput(transcript); handleSend(transcript); }); };
  const handle3DReport = (partName, symptomType) => { setInput(`I am experiencing ${symptomType} in my ${partName}.`); handleSend(`I am experiencing ${symptomType} in my ${partName}.`); };

  const handleCardClick = (type) => {
    setPanelMode(type); 
    if (type === 'report' || type === 'xray') {
      fileInputRef.current.click();
      setPanelContent({ title: type === 'report' ? 'Lab Report Analysis' : 'X-Ray Scan Analysis', loading: true });
    } 
    else if (type === 'firstaid') setPanelContent({ title: 'First Aid Protocols', data: firstAidData, selected: null });
    else if (type === 'diagnosis') { setPanelContent({ title: 'AI Diagnosis Interview', text: 'Waiting for symptoms...' }); speak("Describe your symptoms."); }
    else if (type === 'medicine') { setPanelContent({ title: 'Pharmacy & Dosage Guide', text: 'Waiting for disease name...' }); speak("What is the disease name?"); }
    else if (type === 'diet') { setPanelContent({ title: 'Smart Diet Planner', text: 'Waiting for health details...' }); speak("Tell me your condition."); }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setPanelContent(prev => ({ ...prev, image: objectUrl, text: "Analyzing image...", loading: true }));
    setIsLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_name", user.name); 

    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/vision/analyze`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const result = response.data.analysis;
      setPanelContent(prev => ({ ...prev, text: result, loading: false }));
      setMessages(prev => [...prev, { role: 'bot', text: "Report analyzed and saved." }]);
      saveSession(`Image Analysis: ${file.name}`, result, 'Vision Report', user); // PASS USER
      speak("Report saved.");
    } catch (error) {
      setPanelContent(prev => ({ ...prev, text: "Error analyzing image.", loading: false }));
    } finally {
      setIsLoading(false);
    }
  };

  // --- UPDATED DOWNLOAD HANDLER ---
  const handleDownloadPanel = () => {
    if (panelContent && panelContent.text) {
      // Create a temporary record for PDF generation that includes USER details
      generatePDF({
        date: new Date().toLocaleDateString(),
        type: panelContent.title || 'Report',
        symptoms: 'Generated via Dr.Care Dashboard',
        diagnosis: panelContent.text,
        patient: user // Pass current user state
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 relative">
      {!user && <LoginModal onLogin={handleLogin} />}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />

      <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm sticky top-0 z-50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.reload()}>
          <div className="bg-teal-100 p-2 rounded-lg"><Activity className="w-6 h-6 text-teal-600" /></div>
          <span className="text-xl font-bold text-slate-900">Dr.Care</span>
        </div>
        <div className="flex gap-4 items-center">
           {user && <span className="hidden md:inline-block text-xs font-bold text-teal-600 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">Patient: {user.name} ({user.bloodGroup})</span>}
           {panelMode !== '3d' && (<button onClick={() => setPanelMode('3d')} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-full hover:bg-slate-700 transition animate-fade-in"><ArrowLeft className="w-4 h-4" /> Back to 3D</button>)}
           <button onClick={() => setView('history')} className="text-slate-500 hover:text-teal-600 font-medium flex items-center gap-2"><History className="w-4 h-4" /> History</button>
           <button onClick={() => setPanelMode('firstaid')} className="bg-red-500 text-white px-4 py-2 rounded-full font-bold shadow-md hover:bg-red-600 transition flex items-center gap-2"><Zap className="w-4 h-4 fill-current" /> Emergency</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {view === 'dashboard' && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[650px] mb-8">
              <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden relative flex flex-col transition-all duration-500">
                {panelMode === '3d' && (<div className="w-full h-full bg-[#0f172a] holo-grid relative"><BodyMap3D onReport={handle3DReport} /><div className="absolute top-4 left-4 text-white/50 text-xs uppercase tracking-widest">Interactive Bio-Scanner Active</div></div>)}

                {['diagnosis', 'medicine', 'diet'].includes(panelMode) && (
                  <div className="flex flex-col h-full animate-fade-in">
                    <div className="p-6 border-b border-slate-100 bg-teal-50 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {panelMode === 'diagnosis' && <ClipboardList className="w-6 h-6 text-indigo-600" />}
                        {panelMode === 'medicine' && <Pill className="w-6 h-6 text-green-600" />}
                        {panelMode === 'diet' && <Utensils className="w-6 h-6 text-orange-600" />}
                        <h2 className="text-xl font-bold text-slate-800">{panelContent?.title}</h2>
                      </div>
                      {panelContent?.text && !panelContent.text.startsWith('Waiting') && (
                        <button onClick={handleDownloadPanel} className="text-sm bg-white border border-teal-200 text-teal-700 px-3 py-1 rounded-lg flex items-center gap-1 hover:bg-teal-50"><Download className="w-4 h-4"/> Save PDF</button>
                      )}
                    </div>
                    <div className="flex-1 p-8 overflow-y-auto bg-white">
                      {!panelContent?.text || panelContent?.text.startsWith('Waiting') ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-50"><Activity className="w-16 h-16 mb-4 animate-pulse" /><p>AI is processing your request...</p></div>
                      ) : <div className="prose prose-teal max-w-none">{renderFormattedText(panelContent.text)}</div>}
                    </div>
                  </div>
                )}
                {['report', 'xray'].includes(panelMode) && (
                  <div className="flex flex-col h-full animate-fade-in">
                    <div className="p-4 border-b border-slate-100 bg-blue-50 flex justify-between items-center">
                      <h2 className="font-bold text-blue-900 flex items-center gap-2"><FileText className="w-5 h-5" /> {panelContent?.title}</h2>
                      {panelContent?.text && (<button onClick={handleDownloadPanel} className="text-sm bg-white border border-blue-200 text-blue-700 px-3 py-1 rounded-lg flex items-center gap-1 hover:bg-blue-50"><Download className="w-4 h-4"/> Save PDF</button>)}
                    </div>
                    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden">
                      <div className="w-full md:w-1/2 bg-slate-900 flex items-center justify-center p-4">{panelContent?.image ? (<img src={panelContent.image} alt="Upload" className="max-h-full max-w-full rounded shadow-lg border border-slate-700" />) : <div className="text-white/50 text-sm">Waiting for upload...</div>}</div>
                      <div className="w-full md:w-1/2 p-6 overflow-y-auto bg-white"><h3 className="font-bold text-slate-800 mb-4 border-b pb-2">AI Analysis Report</h3>{panelContent?.loading ? (<div className="flex items-center gap-2 text-teal-600">Analyzing...</div>) : <div className="text-sm text-slate-600 leading-relaxed">{renderFormattedText(panelContent?.text)}</div>}</div>
                    </div>
                  </div>
                )}
                {panelMode === 'firstaid' && (
                  <div className="flex flex-col h-full animate-slide-up">
                    <div className="p-6 bg-red-50 border-b border-red-100 flex justify-between items-center"><h2 className="text-xl font-bold text-red-700 flex items-center gap-2"><HeartPulse/> Emergency First Aid</h2></div>
                    <div className="flex-1 p-0 overflow-hidden flex">
                      <div className="w-1/3 border-r border-slate-100 overflow-y-auto bg-slate-50">{panelContent?.data?.map((item) => (<button key={item.id} onClick={() => setPanelContent(prev => ({...prev, selected: item}))} className={`w-full text-left p-4 border-b border-slate-100 hover:bg-white transition ${panelContent?.selected?.id === item.id ? 'bg-white border-l-4 border-red-500 shadow-sm' : ''}`}><div className="font-bold text-slate-800">{item.title}</div><div className="text-xs text-slate-400 truncate">{item.desc}</div></button>))}</div>
                      <div className="flex-1 p-8 overflow-y-auto bg-white">{panelContent?.selected ? (<div><h3 className="text-2xl font-bold text-slate-900 mb-4">{panelContent.selected.title}</h3><div className="space-y-4">{panelContent.selected.steps.map((step, idx) => (<div key={idx} className="flex gap-4"><div className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center font-bold flex-shrink-0">{idx+1}</div><div><h4 className="font-bold text-slate-800">{step.title}</h4><p className="text-slate-600">{step.text}</p></div></div>))}</div></div>) : <div className="flex flex-col items-center justify-center h-full text-slate-400"><HeartPulse className="w-12 h-12 mb-2 opacity-50" /><p>Select an emergency type</p></div>}</div>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-lg flex flex-col h-full relative overflow-hidden">
                <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-white z-10"><h3 className="font-bold text-slate-800">Dr.Care Chat</h3>{isSpeaking ? (<button onClick={stopSpeaking} className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded-full font-bold flex items-center gap-1 animate-pulse"><Volume2 className="w-3 h-3" /> Stop Voice</button>) : <span className="text-xs text-green-500 font-medium">● Online</span>}</div>
                <div className="flex-1 p-4 overflow-y-auto space-y-4 scrollbar-hide bg-slate-50/50">{messages.map((msg, idx) => (<div key={idx} className={`flex gap-3 animate-message ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}><div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm ${msg.role === 'bot' ? 'bg-teal-100 text-teal-600' : 'bg-slate-800 text-white'}`}>{msg.role === 'bot' ? <Activity className="w-4 h-4" /> : <User className="w-4 h-4" />}</div><div className={`p-3 rounded-2xl text-sm leading-relaxed max-w-[85%] shadow-sm ${msg.role === 'bot' ? 'bg-white text-slate-700' : 'bg-teal-600 text-white'}`}>{msg.role === 'bot' ? renderFormattedText(msg.text) : msg.text}</div></div>))}{isLoading && <div className="ml-12 text-xs text-slate-400 flex items-center gap-1"><div className="typing-dot"/> Dr.Care is thinking...</div>}<div ref={chatEndRef} /></div>
                <div className="p-4 bg-white border-t border-slate-100 flex gap-2"><div className="flex-1 relative"><input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSend()} placeholder={isListening ? "Listening..." : "Type here..."} className={`w-full pl-4 pr-10 py-3 bg-slate-100 rounded-xl outline-none text-sm transition ${isListening ? 'bg-red-50 border border-red-200' : ''}`} /><button onClick={handleMicClick} className={`absolute right-2 top-2 p-1.5 rounded-lg transition ${isListening ? 'text-red-500 animate-pulse' : 'text-slate-400 hover:bg-slate-200'}`}>{isListening ? <StopCircle className="w-4 h-4"/> : <Mic className="w-4 h-4" />}</button></div><button onClick={() => handleSend()} className="p-3 bg-teal-600 hover:bg-teal-700 rounded-xl text-white shadow-md"><Send className="w-4 h-4" /></button></div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <FeatureBtn icon={<FileText />} title="Report" color="bg-blue-50 text-blue-600" onClick={() => handleCardClick('report')} active={panelMode === 'report'} />
              <FeatureBtn icon={<Camera />} title="X-Ray" color="bg-purple-50 text-purple-600" onClick={() => handleCardClick('xray')} active={panelMode === 'xray'} />
              <FeatureBtn icon={<HeartPulse />} title="First Aid" color="bg-red-50 text-red-600" onClick={() => handleCardClick('firstaid')} active={panelMode === 'firstaid'} />
              <FeatureBtn icon={<ClipboardList />} title="Diagnosis" color="bg-indigo-50 text-indigo-600" onClick={() => handleCardClick('diagnosis')} active={panelMode === 'diagnosis'} />
              <FeatureBtn icon={<Pill />} title="Medicine" color="bg-green-50 text-green-600" onClick={() => handleCardClick('medicine')} active={panelMode === 'medicine'} />
              <FeatureBtn icon={<Utensils />} title="Diet Plan" color="bg-orange-50 text-orange-600" onClick={() => handleCardClick('diet')} active={panelMode === 'diet'} />
            </div>
          </>
        )}

        {view === 'history' && (
           <div className="max-w-4xl mx-auto animate-fade-in">
             <button onClick={() => setView('dashboard')} className="mb-6 flex items-center text-slate-500 hover:text-teal-600 transition"><ArrowLeft className="mr-2 w-4 h-4"/> Back to Dashboard</button>
             <h1 className="text-3xl font-bold mb-6 text-slate-800">Patient History</h1>
             {historyData.length === 0 ? (
               <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300"><FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" /><p className="text-slate-500 text-lg">No medical records found yet.</p><button onClick={() => setView('dashboard')} className="mt-4 text-teal-600 hover:underline">Go back to create one</button></div>
             ) : (
               <div className="grid gap-4">
                  {historyData.map((r, idx) => (
                    <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex justify-between items-center hover:shadow-md transition">
                      <div>
                        <div className="flex items-center gap-3 mb-1"><span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-bold uppercase">{r.type}</span><span className="text-xs text-slate-400">{r.date} • {r.time}</span></div>
                        <div className="font-bold text-slate-800 text-lg">{r.symptoms.length > 50 ? r.symptoms.substring(0,50) + "..." : r.symptoms}</div>
                        <div className="text-sm text-slate-500 mt-1 line-clamp-1">{r.diagnosis.substring(0, 100)}...</div>
                      </div>
                      <button onClick={() => generatePDF(r)} className="bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"><Download className="w-4 h-4"/> Download</button>
                    </div>
                  ))}
               </div>
             )}
           </div>
        )}
      </main>
    </div>
  );
}

function FeatureBtn({ icon, title, color, onClick, active }) {
  return (
    <button onClick={onClick} className={`p-4 rounded-xl border transition flex flex-col items-center justify-center gap-2 ${active ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200 scale-105' : 'bg-white border-slate-100 hover:shadow-md hover:-translate-y-1'}`}>
      <div className={`p-2 rounded-full ${color}`}>{React.cloneElement(icon, { className: "w-5 h-5" })}</div>
      <span className="font-bold text-slate-700 text-sm">{title}</span>
    </button>
  );
}

export default App;