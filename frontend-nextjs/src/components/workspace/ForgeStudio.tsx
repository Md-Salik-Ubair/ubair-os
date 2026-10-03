'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export type ForgeAgentMode = 'auto' | 'sandbox' | 'architect' | 'research' | 'browser';

interface AttachedFilePreview {
  file: File;
  name: string;
  size: number;
  type: string;
}

interface ForgeStepNode {
  id: string;
  timestamp: string;
  userPrompt: string;
  assignedAgent: string;
  detectedMode: string;
  modeId: ForgeAgentMode;
  status: 'running' | 'success' | 'error';
  executionTime?: number;
  output: string;
  attachments?: { name: string; size: number }[];
  suggestedFollowUps?: string[];
}

interface ForgeStudioProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type GuideLang = string;

const LANG_OPTIONS: { id: GuideLang; label: string; code: string }[] = [
  { id: 'en', label: 'English (US/UK)', code: 'EN' },
  { id: 'hinglish', label: 'Hinglish', code: 'HINGLISH' },
  { id: 'hi', label: 'हिन्दी (Hindi)', code: 'HI' },
  { id: 'or', label: 'ଓଡ଼ିଆ (Odia)', code: 'OR' },
  { id: 'bn', label: 'বাংলা (Bengali)', code: 'BN' },
  { id: 'ta', label: 'தமிழ் (Tamil)', code: 'TA' },
  { id: 'te', label: 'తెలుగు (Telugu)', code: 'TE' },
  { id: 'mr', label: 'मराठी (Marathi)', code: 'MR' },
  { id: 'es', label: 'Español (Spanish)', code: 'ES' },
  { id: 'fr', label: 'Français (French)', code: 'FR' },
  { id: 'de', label: 'Deutsch (German)', code: 'DE' },
  { id: 'ja', label: '日本語 (Japanese)', code: 'JA' },
  { id: 'ar', label: 'العربية (Arabic)', code: 'AR' },
];

const FORGE_GUIDES: Record<string, { heading: string; steps: { num: string; icon: string; title: string; desc: string }[] }> = {
  en: {
    heading: 'Autonomous Execution Lifecycle',
    steps: [
      { num: '1.', icon: '🎯', title: 'Intent Deconstruction & Planning', desc: 'Analyzes technical directives, code snippets, or URLs and breaks down complex requests into an actionable execution graph.' },
      { num: '2.', icon: '⚡', title: 'Specialized Multi-Agent Dispatch', desc: 'Directs tasks to stateless cloud sandboxes, deep architecture doctors, academic research nodes, or live web extractors.' },
      { num: '3.', icon: '🧠', title: 'In-Memory Context Continuity', desc: 'Retains code artifacts, variables, and findings across consecutive turns without polluting your primary chat history.' },
      { num: '4.', icon: '🛡️', title: 'Zero-Trace Container Teardown', desc: 'Execution buffers, temporary sandbox states, and allocated memory instances are purged on session reset or exit.' },
    ]
  },
  hinglish: {
    heading: 'Forge Execution Pipeline Kaise Kaam Karta Hai',
    steps: [
      { num: '1.', icon: '🎯', title: 'Intent Analysis & Blueprinting', desc: 'Aapki technical query, script ya URL ko samajh kar execution graph formulate karta hai.' },
      { num: '2.', icon: '⚡', title: 'Targeted Agent Node Dispatch', desc: 'Code Sandbox, Architecture Doctor, Research ya Headless Web Agent ko automatically deploy karta hai.' },
      { num: '3.', icon: '🧠', title: 'In-Memory Multi-Turn Context', desc: 'Pichle step ka output aur context agle turn me retain rehta hai bina main conversation ko clutter kiye.' },
      { num: '4.', icon: '🛡️', title: 'Instant Zero-Trace Teardown', desc: 'Session reset ya exit karte hi saare cloud container buffers aur temporary states safely wipe ho jaate hain.' },
    ]
  },
  hi: {
    heading: 'स्वायत्त निष्पादन पाइपलाइन की कार्यप्रणाली',
    steps: [
      { num: '1.', icon: '🎯', title: 'उद्देश्य विश्लेषण एवं कार्ययोजना', desc: 'तकनीकी निर्देशों और कोड का विश्लेषण करके निष्पादन से पूर्व चरणबद्ध कार्ययोजना तैयार करता है।' },
      { num: '2.', icon: '⚡', title: 'स्वायत्त मल्टी-एजेंट परिनियोजन', desc: 'सैंडबॉक्स, सिस्टम ऑडिट, तकनीकी शोध अथवा वेब एजेंट को सीधे सक्रिय करता है।' },
      { num: '3.', icon: '🧠', title: 'सक्रिय इन-मेमोरी संदर्भ', desc: 'मुख्य चैट को प्रभावित किए बिना पूरे सत्र के दौरान सभी मध्यवर्ती कोड व परिणाम याद रखता है।' },
      { num: '4.', icon: '🛡️', title: 'शून्य-निशान सुरक्षित निष्कासन', desc: 'सत्र समाप्त या रीसेट होते ही सभी कंटेनर बफ़र स्वतः नष्ट हो जाते हैं।' },
    ]
  },
  or: {
    heading: 'ସ୍ୱୟଂଚାଳିତ ନିଷ୍ପାଦନ ପ୍ରକ୍ରିୟା',
    steps: [
      { num: '1.', icon: '🎯', title: 'ଉଦ୍ଦେଶ୍ୟ ବିଶ୍ଳେଷଣ ଏବଂ ଯୋଜନା', desc: 'ନିର୍ଦ୍ଦେଶକୁ ବିଶ୍ଳେଷଣ କରି ପ୍ରକ୍ରିୟା ଆରମ୍ଭ ପୂର୍ବରୁ ଏକ ନିର୍ଭୁଲ କାର୍ଯ୍ୟ ଯୋଜନା ପ୍ରସ୍ତୁତ କରେ।' },
      { num: '2.', icon: '⚡', title: 'ସ୍ୱୟଂଚାଳିତ ଏଜେଣ୍ଟ ନିୟୋଜନ', desc: 'କୋଡ୍ ସ୍ୟାଣ୍ଡବକ୍ସ, ସିଷ୍ଟମ୍ ଅଡିଟ୍, ଗବେଷଣା କିମ୍ବା ୱେବ୍ ଏଜେଣ୍ଟକୁ ସିଧାସଳଖ ସକ୍ରିୟ କରେ।' },
      { num: '3.', icon: '🧠', title: 'ନିରନ୍ତର ମେମୋରୀ ସଂଯୋଗ', desc: 'ମୁଖ୍ୟ ଚାଟ୍ ଇତିହାସକୁ ପ୍ରଭାବିତ ନକରି ସମସ୍ତ ପୂର୍ବ ଫଳାଫଳକୁ ମନେ ରଖେ।' },
      { num: '4.', icon: '🛡️', title: 'ତୁରନ୍ତ ସୁରକ୍ଷିତ ତଥ୍ୟ ବିନାଶ', desc: 'ରିସେଟ୍ କିମ୍ବା ବନ୍ଦ କରିବା ମାତ୍ରେ ସମସ୍ତ କ୍ଲାଉଡ୍ ଡାଟା ସମ୍ପୂର୍ଣ୍ଣ ବିଲୋପ ହୋଇଯାଏ।' },
    ]
  },
  bn: {
    heading: 'স্বায়ত্তশাসিত এক্সিকিউশন পাইপলাইন',
    steps: [
      { num: '1.', icon: '🎯', title: 'উদ্দেশ্য বিশ্লেষণ ও পরিকল্পনা', desc: 'প্রযুক্তিগত নির্দেশ বিশ্লেষণ করে কাজ শুরুর আগে নির্ভুল এক্সিকিউশন প্ল্যান তৈরি করে।' },
      { num: '2.', icon: '⚡', title: 'মাল্টি-এজেন্ট মোতায়েন', desc: 'কোড স্যান্ডবক্স, আর্কিটেকচার ডাক্তার বা ওয়েব এজেন্টে স্বয়ংক্রিয়ভাবে রুট করে।' },
      { num: '3.', icon: '🧠', title: 'মেমোরি ধারাবাহিকতা', desc: 'মূল চ্যাট প্রভাবিত না করে প্রতিটি ধাপের কোড ও ফলাফল স্মৃতিতে ধরে রাখে।' },
      { num: '4.', icon: '🛡️', title: 'নিরাপদ ডেটা ধ্বংস', desc: 'রিসেট বা প্রস্থান করার সাথে সাথে ক্লাউড বাফার সম্পূর্ণ মুছে ফেলা হয়।' },
    ]
  },
  ta: {
    heading: 'சுயாட்சி செயல்படுத்தல் முறை',
    steps: [
      { num: '1.', icon: '🎯', title: 'நோக்க பகுப்பாய்வு & திட்டம்', desc: 'தொழில்நுட்ப கட்டளைகளை ஆராய்ந்து துல்லியமான செயல்படுத்தல் திட்டத்தை உருவாக்குகிறது.' },
      { num: '2.', icon: '⚡', title: 'சுயாட்சி முகவர் வரிசைப்படுத்தல்', desc: 'கோட் சாண்ட்பாக்ஸ், கணினி தணிக்கை அல்லது வலை முகவருக்கு நேரடியாக அனுப்புகிறது.' },
      { num: '3.', icon: '🧠', title: 'நினைவக தொடர்ச்சி', desc: 'முதன்மை உரையாடலை பாதிக்காமல் முந்தைய அனைத்து முடிவுகளையும் நினைவில் கொள்கிறது.' },
      { num: '4.', icon: '🛡️', title: 'பாதுகாப்பான அழிவு', desc: 'மீட்டமைக்கும்போது அல்லது வெளியேறும்போது அனைத்து கிளவுட் தரவுகளும் அழிக்கப்படும்.' },
    ]
  },
  te: {
    heading: 'స్వయంప్రతిపత్తి ఎగ్జిక్యూషన్ లైఫ్‌సైకిల్',
    steps: [
      { num: '1.', icon: '🎯', title: 'లక్ష్య విశ్లేషణ & ప్రణాళిక', desc: 'టాస్క్‌ను విశ్లేషించి అమలు చేయడానికి ముందు ఖచ్చితమైన కార్యాచరణ ప్రణాళికను సిద్ధం చేస్తుంది.' },
      { num: '2.', icon: '⚡', title: 'మల్టీ-ఏజెంట్ డిస్పాచ్', desc: 'కోడ్ శాండ్‌బాక్స్, ఆర్కిటెక్చర్ డాక్టర్ లేదా వెబ్ ఏజెంట్‌ను నేరుగా యాక్టివేట్ చేస్తుంది.' },
      { num: '3.', icon: '🧠', title: 'మెమరీ కొనసాగింపు', desc: 'ప్రధాన చాట్‌ను ప్రభావితం చేయకుండా మునుపటి ఫలితాలను గుర్తుంచుకుంటుంది.' },
      { num: '4.', icon: '🛡️', title: 'తక్షణ డేటా తొలగింపు', desc: 'రీసెట్ లేదా నిష్క్రమణ సమయంలో తాత్కాలిక క్లౌడ్ బఫర్‌లు తొలగించబడతాయి.' },
    ]
  },
  mr: {
    heading: 'स्वायत्त अंमलबजावणी प्रणाली',
    steps: [
      { num: '1.', icon: '🎯', title: 'उद्देश विश्लेषण आणि नियोजन', desc: 'तांत्रिक सूचनांचे विश्लेषण करून अंमलबजावणीपूर्वी अचूक आराखडा तयार करतो.' },
      { num: '2.', icon: '⚡', title: 'मल्टी-एजंट उपयोजन', desc: 'कोड सँडबॉक्स, सिस्टीम ऑडिट किंवा वेब एजंटला थेट सक्रिय करतो.' },
      { num: '3.', icon: '🧠', title: 'अखंड मेमरी सातत्य', desc: 'मुख्य चॅट प्रभावित न करता मागील सर्व संदर्भ सुरक्षित ठेवतो.' },
      { num: '4.', icon: '🛡️', title: 'सुरक्षित डेटा नष्टीकरण', desc: 'रीसेट किंवा बाहेर पडताच सर्व तात्पुरता क्लाउड डेटा त्वरित नष्ट केला जातो.' },
    ]
  },
  es: {
    heading: 'Ciclo de Ejecución Autónoma',
    steps: [
      { num: '1.', icon: '🎯', title: 'Descomposición y Planificación', desc: 'Analiza directivas técnicas y formula un plan estructurado antes del despliegue.' },
      { num: '2.', icon: '⚡', title: 'Despacho de Nodos Multiagente', desc: 'Enruta a sandboxes aislados, auditoría de software, investigación o agentes web.' },
      { num: '3.', icon: '🧠', title: 'Continuidad de Contexto en Memoria', desc: 'Conserva el estado y los artefactos sin saturar el historial principal de chat.' },
      { num: '4.', icon: '🛡️', title: 'Destrucción Efímera Sin Rastro', desc: 'Todos los estados temporales se destruyen de forma segura al salir o reiniciar.' },
    ]
  },
  fr: {
    heading: "Cycle d'Exécution Autonome",
    steps: [
      { num: '1.', icon: '🎯', title: 'Décomposition et Planification', desc: "Analyse l'objectif technique et élabore un plan d'action avant l'exécution." },
      { num: '2.', icon: '⚡', title: 'Déploiement Multi-Agents', desc: 'Route vers des sandboxes cloud isolés, des auditeurs de code ou des agents web temps réel.' },
      { num: '3.', icon: '🧠', title: 'Continuité en Mémoire Active', desc: "Maintient l'état et les artefacts d'un tour à l'autre sans encombrer le chat principal." },
      { num: '4.', icon: '🛡️', title: 'Purge Éphémère Totale', desc: 'Tous les conteneurs et tampons de mémoire sont purgés à la réinitialisation.' },
    ]
  },
  de: {
    heading: 'Autonomer Ausführungszyklus',
    steps: [
      { num: '1.', icon: '🎯', title: 'Zielanalyse & Planung', desc: 'Analysiert technische Vorgaben und erstellt vorab einen klaren Ablaufplan.' },
      { num: '2.', icon: '⚡', title: 'Multi-Agenten-Bereitstellung', desc: 'Leitet an Cloud-Sandboxes, Auditoren, Rechercheknoten oder Web-Agenten weiter.' },
      { num: '3.', icon: '🧠', title: 'Sitzungsspeicher-Kontinuität', desc: 'Erhält Ergebnisse über mehrere Schritte hinweg, ohne den Haupt-Chat zu belasten.' },
      { num: '4.', icon: '🛡️', title: 'Rückstandslose Pufferbereinigung', desc: 'Alle temporären Container werden beim Verlassen oder Zurücksetzen gelöscht.' },
    ]
  },
  ja: {
    heading: '自律型実行サイクルの仕組み',
    steps: [
      { num: '1.', icon: '🎯', title: 'タスク意図の解析と計画', desc: '技術的な目的を詳細に解析し、最適な実行計画を構築します。' },
      { num: '2.', icon: '⚡', title: '自律型ノードへの展開', desc: 'クラウドサンドボックス、アーキテクチャ監査、Webエージェントへ直接指示を振り分けます。' },
      { num: '3.', icon: '🧠', title: 'セッション内の継続性保持', desc: 'メインチャットを汚染することなく、前後のコード状態をメモリ内で維持します。' },
      { num: '4.', icon: '🛡️', title: '終了時の即時完全消去', desc: 'リセットまたは退出時に、すべての実行バッファが安全に破棄されます。' },
    ]
  },
  ar: {
    heading: 'آلية عمل مصفوفة Forge المستقلة',
    steps: [
      { num: '1.', icon: '🎯', title: 'تحليل المهمة والتخطيط', desc: 'تحليل الهدف البرمجي وصياغة خطة التنفيذ بدقة قبل بدء التشغيل.' },
      { num: '2.', icon: '⚡', title: 'توجيه الوكلاء المستقلين', desc: 'التشغيل عبر صناديق اختبار سحابية معزولة أو أطباء فحص الأنظمة أو وكلاء الويب.' },
      { num: '3.', icon: '🧠', title: 'استمرارية الذاكرة النشطة', desc: 'الاحتفاظ بمخرجات الأكواد بين الخطوات المتتالية دون التأثير على المحادثة العامة.' },
      { num: '4.', icon: '🛡️', title: 'التدمير الذاتي المؤقت', desc: 'حذف وتفريغ جميع الحاويات السحابية بمجرد إعادة التعيين أو الخروج بأمان.' },
    ]
  }
};

const FORGE_CAPABILITIES_DATA: Record<string, { heading: string; items: { num: string; icon: string; title: string; desc: string }[] }> = {
  en: {
    heading: 'Real-World Technical Capabilities',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'Stateless Cloud Script Execution',
        desc: 'Execute Python, TypeScript, Node.js scripts, complex math, or algorithms in isolated containers with live stdout telemetry and execution runtime measurement.'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'Full-Stack Codebase & Concurrency Audits',
        desc: 'Paste GitHub repositories, class hierarchies, or WebSocket connection pools to detect deadlocks, race conditions, memory leaks, and state flaws.'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'Deep Engineering Research & Benchmarks',
        desc: 'Cross-reference verified facts across engineering RFCs, academic whitepapers, and kernel specifications without marketing fluff.'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'Live Headless Web & Media Extraction',
        desc: 'Paste any YouTube URL or technical documentation link to navigate headless Chromium, extract clean transcripts, structured tables, and DOM trees.'
      }
    ]
  },
  hinglish: {
    heading: 'Forge Aapke Liye Asal Me Kya Kar Sakta Hai',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'Isolated Cloud Script Execution',
        desc: 'Python, Node.js ya complex scripts ko cloud sandbox me live run karke execution telemetry, memory footprint aur stdout output dekhein.'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'Codebase & Concurrency Invariant Audits',
        desc: 'GitHub repo excerpts ya code paste karein. Deadlocks, race conditions, memory leaks aur unhandled state bugs ka root-cause nikalta hai.'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'Real-Time Deep Technical Research',
        desc: 'Engineering whitepapers, kernel specifications ya architecture benchmarks ka deep comparative analysis bina kisi speculation ke.'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'Live Web & YouTube Content Extraction',
        desc: 'Kisi website ya YouTube URL ka link dein. Headless Chromium live page traverse karke structural content, tables aur data extract karega.'
      }
    ]
  },
  hi: {
    heading: 'वास्तविक तकनीकी क्षमताएं',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'क्लाउड कोड निष्पादन एवं टेलीमेट्री',
        desc: 'Python और JS स्क्रिप्ट को सुरक्षित क्लाउड कंटेनर में चलाकर तत्काल निष्पादन समय और आउटपुट प्राप्त करें।'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'आर्किटेक्चर एवं समवर्ती त्रुटि विश्लेषण',
        desc: 'कोड या रिपॉजिटरी में डेडलॉक, मेमोरी लीक और रेस कंडीशंस की पहचान कर मूल कारण का समाधान प्रदान करता है।'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'गहन तकनीकी अनुसंधान एवं तुलना',
        desc: 'शोध पत्रों, इंजीनियरिंग मानकों और सिस्टम बेंचमार्क का व्यापक तुलनात्मक विश्लेषण।'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'लाइव वेब एवं मीडिया डेटा निष्कर्षण',
        desc: 'वेबसाइट अथवा YouTube लिंक से संरचित पाठ, डेटा तालिकाएं और DOM मेटाडेटा का स्वचालित निष्कर्षण।'
      }
    ]
  },
  or: {
    heading: 'ପ୍ରକୃତ ବୈଷୟିକ କାର୍ଯ୍ୟକ୍ଷମତା',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'କ୍ଲାଉଡ୍ କୋଡ୍ ନିଷ୍ପାଦନ ଏବଂ ଟେଲିମେଟ୍ରି',
        desc: 'Python ଏବଂ Node.js ସ୍କ୍ରିପ୍ଟକୁ ସୁରକ୍ଷିତ କଣ୍ଟେନରରେ ଚଳାଇ ତୁରନ୍ତ ନିଷ୍ପାଦନ ଫଳାଫଳ ପ୍ରଦାନ କରେ।'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'କୋଡ୍ ତ୍ରୁଟି ଏବଂ ଡେଡଲକ୍ ଅଡିଟ୍',
        desc: 'କୋଡ୍ ମଧ୍ୟରେ ଡେଡଲକ୍, ମେମୋରୀ ଲିକ୍ ଏବଂ ସମସ୍ୟା ଗୁଡ଼ିକର ମୂଳ କାରଣ ବିଶ୍ଳେଷଣ କରେ।'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'ଗଭୀର ବୈଷୟିକ ଅନୁସନ୍ଧାନ',
        desc: 'ଇଞ୍ଜିନିୟରିଂ ଶ୍ୱେତପତ୍ର ଏବଂ ସିଷ୍ଟମ୍ ବେଞ୍ଚମାର୍କର ସଠିକ୍ ତୁଳନାତ୍ମକ ଅଧ୍ୟୟନ।'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'ଲାଇଭ୍ ୱେବ୍ ଏବଂ ଡାଟା ନିଷ୍କାସନ',
        desc: 'ୱେବସାଇଟ୍ କିମ୍ବା YouTube ଲିଙ୍କରୁ ସ୍ୱୟଂଚାଳିତ ଭାବରେ ସଠିକ୍ ତଥ୍ୟ ସଂଗ୍ରହ କରେ।'
      }
    ]
  },
  bn: {
    heading: 'বাস্তবসম্মত প্রযুক্তিগত সক্ষমতা',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'ক্লাউড স্ক্রিপ্ট এক্সিকিউশন ও টেলিমেট্রি',
        desc: 'পাইথন এবং নোড স্ক্রিপ্ট বিচ্ছিন্ন ক্লাউড পাত্রে চালিয়ে তাত্ক্ষণিক এক্সিকিউশন সময় এবং আউটপুট পান।'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'কোডবেস ও সমবর্তী ত্রুটি অডিট',
        desc: 'কোডবেস বা ক্লাসে ডেডলক, মেমরি লিক এবং রেস কন্ডিশন শনাক্ত করে মূল কারণের সমাধান দেয়।'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'গভীর প্রকৌশল গবেষণা ও বেঞ্চমার্ক',
        desc: 'প্রকৌশল আরএফসি, প্রযুক্তিগত গবেষণাপত্র এবং কার্নেল স্পেসিফিকেশনের সঠিক তুলনামূলক বিশ্লেষণ।'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'লাইভ ওয়েব ও মিডিয়া ডেটা এক্সট্র্যাকশন',
        desc: 'ওয়েবসাইট বা ইউটিউব লিংক থেকে কাঠামোগত টেক্সট, টেবিল ও ডিওএম মেটাডেটা স্বয়ংক্রিয়ভাবে নিষ্কাশন করে।'
      }
    ]
  },
  ta: {
    heading: 'நடைமுறை தொழில்நுட்ப திறன்கள்',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'கிளவுட் ஸ்கிரிப்ட் செயலாக்கம் & டெலிமெட்ரி',
        desc: 'பைதான் மற்றும் நோட் ஸ்கிரிப்ட்களை தனிமைப்படுத்தப்பட்ட கிளவுட் கொள்கலன்களில் இயக்கி உடனுக்குடன் வெளியீட்டைப் பெறுங்கள்.'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'குறியீட்டுத் தணிக்கை & சிக்கல் தீர்வு',
        desc: 'டெத்லாக், மெமரி கசிவு மற்றும் ஒத்திசைவு பிழைகளைக் கண்டறிந்து மூல காரணத்தைக் கண்டறியவும்.'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'ஆழமான பொறியியல் ஆராய்ச்சி',
        desc: 'ஆய்வுக் கட்டுரைகள், அமைப்பின் தரநிலைகள் மற்றும் செயல்திறன் அளவீடுகளின் முழுமையான ஒப்பீடு.'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'வலைப்பக்க & ஊடக தரவு பிரித்தெடுத்தல்',
        desc: 'இணையதளங்கள் அல்லது யூடியூப் இணைப்புகளிலிருந்து தரவு அட்டவணைகள் மற்றும் உரையை உடனடியாக எடுக்கிறது.'
      }
    ]
  },
  te: {
    heading: 'వాస్తవ సాంకేతిక సామర్థ్యాలు',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'క్లౌడ్ స్క్రిప్ట్ ఎగ్జిక్యూషన్ & టెలిమెట్రీ',
        desc: 'పైథాన్ లేదా నోడ్ స్క్రిప్ట్‌లను క్లౌడ్ కంటైనర్‌లో రన్ చేసి అవుట్‌పుట్ మరియు సమయాన్ని కొలవండి.'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'కోడ్‌బేస్ & కాన్కరెన్సీ ఆడిట్స్',
        desc: 'డెడ్‌లాక్స్, మెమరీ లీక్స్ మరియు సమస్యల మూల కారణాలను త్వరగా గుర్తిస్తుంది.'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'లోతైన ఇంజనీరింగ్ పరిశోధన',
        desc: 'ఇంజనీరింగ్ పత్రాలు, స్పెసిఫికేషన్లు మరియు సిస్టమ్ బెంచ్‌మార్క్‌ల కచ్చితమైన విశ్లేషణ.'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'లైవ్ వెబ్ & యూట్యూబ్ డేటా సంగ్రహణ',
        desc: 'వెబ్‌సైట్ లేదా యూట్యూబ్ లింక్ నుండి నిర్మాణాత్మక కంటెంట్ మరియు డేటాను స్వయంచాలకంగా తీయండి.'
      }
    ]
  },
  mr: {
    heading: 'प्रत्यक्ष तांत्रिक क्षमता',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'क्लाउड कोड अंमलबजावणी आणि टेलिमेट्री',
        desc: 'Python आणि JS स्क्रिप्ट्स क्लाउड कंटेनरमध्ये चालवून थेट कार्यप्रदर्शन आउटपुट मिळवा.'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'कोड आणि कॉन्करन्सी त्रुटी ऑडिट',
        desc: 'डेडलोक, मेमरी गळती आणि समवर्ती दोषांचे मूळ कारण शोधून अचूक निदान प्रदान करतो.'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'सखोल तांत्रिक संशोधन आणि निकष',
        desc: 'तांत्रिक पेपर्स आणि कर्नल वैशिष्ट्यांचे सखोल तुलनात्मक विश्लेषण.'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'लाइव्ह वेब आणि मीडिया डेटा संकलन',
        desc: 'कोणत्याही वेबसाइट किंवा YouTube लिंकवरून मजकूर आणि टेबल डेटा थेट गोळा करा.'
      }
    ]
  },
  es: {
    heading: 'Capacidades Técnicas Reales',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'Ejecución de Código en la Nube',
        desc: 'Ejecute scripts de Python, Node.js o algoritmos en contenedores aislados con telemetría en vivo.'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'Auditoría de Arquitectura y Concurrencia',
        desc: 'Pegue repositorios de GitHub para diagnosticar interbloqueos, condiciones de carrera y fugas de memoria.'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'Investigación Técnica Profunda',
        desc: 'Cruce datos verificados en RFCs de ingeniería y especificaciones de kernel sin rodeos comerciales.'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'Extracción Web y Multimedia en Vivo',
        desc: 'Pase cualquier enlace de YouTube o documentación web para extraer transcripciones limpias y tablas DOM.'
      }
    ]
  },
  fr: {
    heading: 'Capacités Techniques Concrètes',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'Exécution de Scripts Cloud Sans État',
        desc: 'Exécutez des scripts Python ou Node.js dans des conteneurs isolés avec télémétrie en temps réel.'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'Audit de Codebase et de Concurrence',
        desc: 'Diagnostiquez les interblocages (deadlocks), les fuites de mémoire et les failles de concurrence.'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'Recherche et Synthèse Technique',
        desc: 'Comparez des faits vérifiés à travers des RFC d’ingénierie et des spécifications de noyau (kernel).'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'Extraction Web et YouTube en Direct',
        desc: 'Extrayez des transcriptions propres, des tableaux structurés et des métadonnées DOM depuis n’importe quel lien.'
      }
    ]
  },
  de: {
    heading: 'Praxisnahe Technische Kernfähigkeiten',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'Zustandslose Cloud-Codeausführung',
        desc: 'Führen Sie Python- oder Node.js-Skripte in isolierten Containern mit Live-Telemetrie aus.'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'Codebasis- und Nebenläufigkeitsaudits',
        desc: 'Diagnostizieren Sie Deadlocks, Race Conditions, Speicherlecks und Architekturfehler.'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'Tiefgehende Technische Recherche',
        desc: 'Vergleichen Sie RFC-Standards und Kernel-Spezifikationen ohne Marketing-Floskeln.'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'Live Web- und Medienextraktion',
        desc: 'Übergeben Sie YouTube- oder Web-Links zur Extraktion von Transkripten, Tabellen und DOM-Bäumen.'
      }
    ]
  },
  ja: {
    heading: '実践的な技術的コア能力',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'ステートレスなクラウドコード実行',
        desc: 'PythonやNode.jsスクリプトを隔離コンテナで即座に実行し、テレメトリと実行時間を測定します。'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'コードベースと並行処理の徹底診断',
        desc: 'デッドロック、競合状態、メモリリーク、構造的例外を迅速に特定します。'
      },
      {
        num: '3.',
        icon: '🔬',
        title: '高度な技術仕様と論文の統合分析',
        desc: '工学RFCやカーネル仕様書を横断し、検証済みの正確な技術事実を整理・比較します。'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'リアルタイムWebと動画データの抽出',
        desc: '任意のYouTubeやWebリンクから、クリーンな字幕テキストやDOMデータを自動抽出します。'
      }
    ]
  },
  ar: {
    heading: 'القدرات التقنية العملية',
    items: [
      {
        num: '1.',
        icon: '⚡',
        title: 'تنفيذ الأكواد السحابية المعزولة',
        desc: 'تنفيذ نصوص Python وNode.js البرمجية في حاويات معزولة مع قياس وقت التشغيل المباشر.'
      },
      {
        num: '2.',
        icon: '🩺',
        title: 'فحص الأكواد ومشاكل التزامن',
        desc: 'تشخيص حالات التعارض وتوقف العمليات وتسريبات الذاكرة في قواعد البيانات والأكواد.'
      },
      {
        num: '3.',
        icon: '🔬',
        title: 'أبحاث هندسية ومعيارية متعمقة',
        desc: 'تحليل مقارن دقيق للأوراق الأكاديمية ومواصفات الأنظمة القياسية.'
      },
      {
        num: '4.',
        icon: '🌐',
        title: 'استخراج مباشر لبيانات الويب ويوتيوب',
        desc: 'استخراج النصوص المنظمة والجداول والبيانات من أي رابط يوتيوب أو وثيقة تقنية.'
      }
    ]
  }
};

const FORGE_MODES: {
  id: ForgeAgentMode;
  title: string;
  short: string;
  desc: string;
  icon: string;
  isRecommended?: boolean;
  accentHex: string;
  glowRgba: string;
  ambientBg: string;
}[] = [
  {
    id: 'auto',
    title: 'Autonomous Director',
    short: 'Auto-Pilot',
    desc: 'Intelligent intent routing across specialized execution engines',
    icon: '◈',
    isRecommended: true,
    accentHex: '#06b6d4',
    glowRgba: 'rgba(6,182,212,0.45)',
    ambientBg: 'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(6,182,212,0.08), transparent 75%)',
  },
  {
    id: 'sandbox',
    title: 'Universal Cloud Sandbox',
    short: 'Sandbox',
    desc: 'Stateless cloud container for script runs and algorithmic testing',
    icon: '⚡',
    accentHex: '#f59e0b',
    glowRgba: 'rgba(245,158,11,0.45)',
    ambientBg: 'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(245,158,11,0.08), transparent 75%)',
  },
  {
    id: 'architect',
    title: 'Code & Architecture Doctor',
    short: 'Code Doctor',
    desc: 'Deep audit for deadlocks, memory leaks, and concurrency race conditions',
    icon: '🩺',
    accentHex: '#10b981',
    glowRgba: 'rgba(16,185,129,0.45)',
    ambientBg: 'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(16,185,129,0.08), transparent 75%)',
  },
  {
    id: 'research',
    title: 'Deep Technical Research',
    short: 'Research',
    desc: 'Academic papers, kernel RFCs, and architecture benchmark analysis',
    icon: '🔬',
    accentHex: '#a855f7',
    glowRgba: 'rgba(168,85,247,0.45)',
    ambientBg: 'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(168,85,247,0.08), transparent 75%)',
  },
  {
    id: 'browser',
    title: 'Live Headless Web Agent',
    short: 'Web Agent',
    desc: 'Autonomous DOM navigation, web scraping, and media extraction',
    icon: '🌐',
    accentHex: '#0ea5e9',
    glowRgba: 'rgba(14,165,233,0.45)',
    ambientBg: 'radial-gradient(ellipse 70% 45% at 50% 0%, rgba(14,165,233,0.08), transparent 75%)',
  },
];

export default function ForgeStudio({
  isOpen,
  onClose,
  userEmail = '',
}: ForgeStudioProps) {
  const cleanEmail = useMemo(() => userEmail.trim().toLowerCase() || 'collaborator@ubair.os', [userEmail]);

  const [selectedMode, setSelectedMode] = useState<ForgeAgentMode>('auto');
  const [activeRuntimeMode, setActiveRuntimeMode] = useState<ForgeAgentMode>('auto');
  const [taskInput, setTaskInput] = useState('');
  const [sessionSteps, setSessionSteps] = useState<ForgeStepNode[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);

  // Modals
  const [showExplainerModal, setShowExplainerModal] = useState(false);
  const [showCapabilitiesModal, setShowCapabilitiesModal] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [guideLang, setGuideLang] = useState<GuideLang>('en');

  // Camera Modal Viewfinder State
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Files & Copy Feedback
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFilePreview[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCodeSnippet, setCopiedCodeSnippet] = useState<string | null>(null);

  const [isListening, setIsListening] = useState(false);
  const speechRecognitionRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement | null>(null);
  const canvasBottomRef = useRef<HTMLDivElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const modeMenuRef = useRef<HTMLDivElement | null>(null);
  const langDropdownRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isExecuting) {
      setActiveRuntimeMode(selectedMode);
    }
  }, [selectedMode, isExecuting]);

  const activeModeConfig = useMemo(() => {
    return FORGE_MODES.find((m) => m.id === activeRuntimeMode) || FORGE_MODES[0];
  }, [activeRuntimeMode]);

  useEffect(() => {
    canvasBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionSteps, isExecuting]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setIsAttachMenuOpen(false);
      }
      if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
        setIsModeMenuOpen(false);
      }
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setIsLangDropdownOpen(false);
      }
    };
    if (isAttachMenuOpen || isModeMenuOpen || isLangDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAttachMenuOpen, isModeMenuOpen, isLangDropdownOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (isCameraModalOpen) closeCameraModal();
        else if (isLangDropdownOpen) setIsLangDropdownOpen(false);
        else if (showExplainerModal) setShowExplainerModal(false);
        else if (showCapabilitiesModal) setShowCapabilitiesModal(false);
        else if (isAttachMenuOpen) setIsAttachMenuOpen(false);
        else if (isModeMenuOpen) setIsModeMenuOpen(false);
        else if (isListening) stopListening();
        else if (isExecuting) handleAbort();
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isCameraModalOpen, showExplainerModal, showCapabilitiesModal, isLangDropdownOpen, isAttachMenuOpen, isModeMenuOpen, isListening, isExecuting, onClose]);

  // Camera Management
  const stopHardwareCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [cameraStream]);

  const closeCameraModal = useCallback(() => {
    stopHardwareCamera();
    if (capturedSnapshot) URL.revokeObjectURL(capturedSnapshot);
    setCapturedSnapshot(null);
    setCapturedBlob(null);
    setCameraError(null);
    setIsCameraModalOpen(false);
  }, [stopHardwareCamera, capturedSnapshot]);

  const startHardwareCamera = useCallback(async (mode: 'user' | 'environment' = cameraFacingMode) => {
    setCameraLoading(true);
    setCameraError(null);
    setCapturedSnapshot(null);
    setCapturedBlob(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera hardware access is unsupported in this browser.');
      }
      stopHardwareCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: mode },
        audio: false,
      });

      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera access denied. Please grant permission in browser settings.');
      } else {
        setCameraError(err.message || 'Unable to initialize camera interface.');
      }
    } finally {
      setCameraLoading(false);
    }
  }, [cameraFacingMode, stopHardwareCamera]);

  const handleTriggerCamera = () => {
    setIsAttachMenuOpen(false);
    if (typeof window !== 'undefined') {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                       (navigator.maxTouchPoints > 1 && window.innerWidth < 768);
      if (isMobile && mobileCameraInputRef.current) {
        mobileCameraInputRef.current.click();
      } else {
        setIsCameraModalOpen(true);
        startHardwareCamera();
      }
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      setCapturedBlob(blob);
      setCapturedSnapshot(URL.createObjectURL(blob));
      stopHardwareCamera();
    }, 'image/jpeg', 0.92);
  };

  const confirmCapturedPhoto = () => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
    setAttachedFiles((prev) => [...prev, { file, name: file.name, size: file.size, type: file.type }]);
    closeCameraModal();
  };

  const toggleVoiceRecording = () => {
    if (isListening) {
      stopListening();
      return;
    }

    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice dictation is supported in modern Chrome, Edge, and Safari.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setTaskInput((prev) => (prev ? `${prev.trim()} ${transcript}` : transcript));
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    setIsListening(false);
  };

  const handleAbort = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsExecuting(false);
    setActiveRuntimeMode(selectedMode);
    setSessionSteps((prev) =>
      prev.map((step, idx) =>
        idx === prev.length - 1 && step.status === 'running'
          ? { ...step, status: 'error', output: step.output + '\n\n[Execution halted by operator]' }
          : step
      )
    );
  };

  const handleClearSession = () => {
    if (sessionSteps.length === 0) return;
    if (window.confirm('Reset Forge Session? All in-memory execution artifacts will be destroyed.')) {
      setSessionSteps([]);
      setAttachedFiles([]);
      setTaskInput('');
      setActiveRuntimeMode(selectedMode);
    }
  };

  const handleTriggerFileInput = (acceptType?: string) => {
    setIsAttachMenuOpen(false);
    if (!fileInputRef.current) return;
    fileInputRef.current.accept = acceptType || '*/*';
    fileInputRef.current.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPreviews: AttachedFilePreview[] = Array.from(files).map((f) => ({
      file: f,
      name: f.name,
      size: f.size,
      type: f.type,
    }));

    setAttachedFiles((prev) => [...prev, ...newPreviews]);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles: AttachedFilePreview[] = Array.from(e.dataTransfer.files).map((f) => ({
        file: f,
        name: f.name,
        size: f.size,
        type: f.type,
      }));
      setAttachedFiles((prev) => [...prev, ...droppedFiles]);
    }
  };

  const removeAttachedFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  const detectBestAgent = (prompt: string, mode: ForgeAgentMode): { 
    endpoint: string; 
    agentName: string; 
    modeLabel: string;
    resolvedModeId: ForgeAgentMode;
  } => {
    if (mode === 'sandbox') {
      return { endpoint: `${API_BASE}/api/forge/execute`, agentName: 'sandboxcodingagent', modeLabel: 'Universal Cloud Sandbox', resolvedModeId: 'sandbox' };
    }
    if (mode === 'architect') {
      return { endpoint: `${API_BASE}/api/forge/analyze`, agentName: 'softwareengineeringexpert', modeLabel: 'Code Doctor', resolvedModeId: 'architect' };
    }
    if (mode === 'research') {
      return { endpoint: `${API_BASE}/api/forge/research`, agentName: 'scientificresearchagent', modeLabel: 'Deep Research', resolvedModeId: 'research' };
    }
    if (mode === 'browser') {
      return { endpoint: `${API_BASE}/api/forge/browser`, agentName: 'browsernavigationagent', modeLabel: 'Web Agent', resolvedModeId: 'browser' };
    }

    const p = prompt.toLowerCase();
    if (p.includes('http://') || p.includes('https://') || p.includes('scrape') || p.includes('browse') || p.includes('extract website') || p.includes('youtube')) {
      return { endpoint: `${API_BASE}/api/forge/browser`, agentName: 'browsernavigationagent', modeLabel: 'Web Agent', resolvedModeId: 'browser' };
    }
    if (p.includes('paper') || p.includes('literature') || p.includes('research') || p.includes('compare algorithm') || p.includes('benchmark')) {
      return { endpoint: `${API_BASE}/api/forge/research`, agentName: 'scientificresearchagent', modeLabel: 'Deep Research', resolvedModeId: 'research' };
    }
    if (p.includes('audit') || p.includes('architect') || p.includes('bug') || p.includes('deadlock') || p.includes('leak') || p.includes('refactor')) {
      return { endpoint: `${API_BASE}/api/forge/analyze`, agentName: 'softwareengineeringexpert', modeLabel: 'Code Doctor', resolvedModeId: 'architect' };
    }

    return { endpoint: `${API_BASE}/api/forge/execute`, agentName: 'sandboxcodingagent', modeLabel: 'Universal Cloud Sandbox', resolvedModeId: 'sandbox' };
  };

  const generateFollowUps = (mode: ForgeAgentMode): string[] => {
    if (mode === 'sandbox') {
      return [
        '⚡ Benchmark runtime & memory profile',
        '🩺 Audit this output for race conditions',
        '📋 Generate production markdown specs'
      ];
    }
    if (mode === 'architect') {
      return [
        '⚡ Execute fix script in Cloud Sandbox',
        '🔬 Research peer-reviewed RFC solutions',
        '📋 Summarize root cause checklist'
      ];
    }
    if (mode === 'research') {
      return [
        '⚡ Test these benchmark claims in Sandbox',
        '🩺 Audit architectural bottlenecks',
        '📄 Export findings into whitepaper'
      ];
    }
    if (mode === 'browser') {
      return [
        '📊 Structure output into clean JSON / CSV',
        '⚡ Run Python regex clean-up pipeline',
        '🌐 Inspect next related web link'
      ];
    }
    return [
      '⚡ Run prototype in Sandbox',
      '🩺 Audit system invariants',
      '🔬 Cross-reference with technical papers'
    ];
  };

  const handleDispatchTask = async (customPrompt?: string) => {
    const cleanPrompt = (customPrompt || taskInput).trim();
    if ((!cleanPrompt && attachedFiles.length === 0) || isExecuting) return;

    if (isListening) stopListening();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const { endpoint, agentName, modeLabel, resolvedModeId } = detectBestAgent(cleanPrompt, selectedMode);
    setActiveRuntimeMode(resolvedModeId);

    const stepId = `step_${Date.now()}`;
    const newStep: ForgeStepNode = {
      id: stepId,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      userPrompt: cleanPrompt || 'Analyze attached context payload.',
      assignedAgent: agentName,
      detectedMode: modeLabel,
      modeId: resolvedModeId,
      status: 'running',
      output: '',
      attachments: attachedFiles.map((f) => ({ name: f.name, size: f.size })),
    };

    setSessionSteps((prev) => [...prev, newStep]);
    setTaskInput('');
    const filesToClear = [...attachedFiles];
    setAttachedFiles([]);
    setIsExecuting(true);

    const startTime = Date.now();

    try {
      const priorContext = sessionSteps
        .slice(-3)
        .map((s) => `[Previous Turn (${s.assignedAgent})]: ${s.userPrompt}\n[Result Output]: ${s.output.slice(0, 450)}`)
        .join('\n\n');

      const parsedFileContents = await Promise.all(
        filesToClear.map(async (f) => {
          if (f.file.size < 600000 && !f.type.startsWith('image/')) {
            try {
              const content = await f.file.text();
              return `--- START ATTACHED FILE: ${f.name} ---\n${content}\n--- END FILE ---`;
            } catch {
              return `[Attached File: ${f.name} (${f.size} bytes)]`;
            }
          }
          return `[Attached File: ${f.name} (${f.size} bytes)]`;
        })
      );

      const urlMatch = cleanPrompt.match(/https?:\/\/[^\s]+/);

      const payload: Record<string, any> = {
        task_description: cleanPrompt,
        task: cleanPrompt,
        message: cleanPrompt,
        query: cleanPrompt,
        objective: cleanPrompt,
        code: cleanPrompt,
        start_url: urlMatch ? urlMatch[0] : 'https://www.google.com',
        language: cleanPrompt.includes('const') || cleanPrompt.includes('function') ? 'javascript' : 'python',
        context: [priorContext, ...parsedFileContents].filter(Boolean).join('\n\n') || 'Autonomous directive',
        user_email: cleanEmail,
        user_id: cleanEmail,
      };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = await res.json();
      const elapsed = Number(((Date.now() - startTime) / 1000).toFixed(2));

      if (!res.ok) {
        throw new Error(data.detail || `Server status ${res.status}`);
      }

      setSessionSteps((prev) =>
        prev.map((s) =>
          s.id === stepId
            ? {
                ...s,
                status: 'success',
                executionTime: elapsed,
                output: data.output || 'Task completed with nominal status.',
                suggestedFollowUps: generateFollowUps(resolvedModeId)
              }
            : s
        )
      );
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const elapsed = Number(((Date.now() - startTime) / 1000).toFixed(2));
        setSessionSteps((prev) =>
          prev.map((s) =>
            s.id === stepId
              ? {
                  ...s,
                  status: 'error',
                  executionTime: elapsed,
                  output: `⚠️ Execution failed: ${err.message || 'Agent pipeline unreachable.'}`,
                }
              : s
          )
        );
      }
    } finally {
      setIsExecuting(false);
      abortControllerRef.current = null;
      if (selectedMode === 'auto') {
        setTimeout(() => setActiveRuntimeMode('auto'), 2000);
      }
    }
  };

  const handleCopyArtifact = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCopyCodeSnippet = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeSnippet(code);
    setTimeout(() => setCopiedCodeSnippet(null), 1800);
  };

  const currentSelectedObj = FORGE_MODES.find((m) => m.id === selectedMode) || FORGE_MODES[0];
  const activeGuide = FORGE_GUIDES[guideLang] || FORGE_GUIDES.en;
  const activeCapabilities = FORGE_CAPABILITIES_DATA[guideLang] || FORGE_CAPABILITIES_DATA.en;
  const currentLangObj = LANG_OPTIONS.find((l) => l.id === guideLang) || LANG_OPTIONS[0];

  if (!isOpen) return null;

  // Single Source Input Capsule (Centered on Landing, Docked at Bottom When Active)
  const renderInputCapsule = (isCentered: boolean = false) => (
    <div className={`w-full max-w-3xl relative pointer-events-auto ${isCentered ? 'mt-8' : ''}`}>
      
      {/* Attached Files Chips */}
      {attachedFiles.length > 0 && (
        <div className="w-full flex flex-wrap gap-1.5 mb-2.5">
          {attachedFiles.map((att, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 text-xs text-neutral-300 font-mono"
            >
              <span className="truncate max-w-[150px]">{att.name}</span>
              <button
                type="button"
                onClick={() => removeAttachedFile(idx)}
                className="text-neutral-400 hover:text-white transition-colors ml-0.5 cursor-pointer"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Attachment Popover (Vibrant Icons matching ChatInput) */}
      {isAttachMenuOpen && (
        <div
          ref={attachMenuRef}
          className="absolute bottom-16 left-2 w-52 bg-[#0c0d12]/98 backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.8)] space-y-0.5 animate-in fade-in duration-100 z-50 font-sans"
        >
          <button
            type="button"
            onClick={() => handleTriggerFileInput()}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer text-left"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span>Browse All Files</span>
          </button>

          <button
            type="button"
            onClick={handleTriggerCamera}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer text-left"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-teal-400">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <span>Camera Capture</span>
          </button>

          <button
            type="button"
            onClick={() => handleTriggerFileInput('image/*')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer text-left"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sky-400">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>Upload Image</span>
          </button>

          <button
            type="button"
            onClick={() => handleTriggerFileInput('.pdf,.docx,.doc,.txt,.md,.rtf')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer text-left"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>Document</span>
          </button>

          <button
            type="button"
            onClick={() => handleTriggerFileInput('.csv,.xlsx,.xls,.json,.yaml,.yml,.xml,.tsv,.env,.toml,.ini')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer text-left"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-400">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="9" y1="9" x2="9" y2="21" />
              <line x1="15" y1="9" x2="15" y2="21" />
            </svg>
            <span>Data / Sheets</span>
          </button>

          <button
            type="button"
            onClick={() => handleTriggerFileInput('.py,.js,.ts,.tsx,.jsx,.html,.css,.sql,.sh,.bash,.cpp,.c,.h,.java,.rs,.go,.php')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs text-neutral-300 hover:text-white hover:bg-white/[0.06] transition-all cursor-pointer text-left"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>Code / Scripts</span>
          </button>
        </div>
      )}

      {/* Engine Mode Menu (Compact w-[310px] & Titanium Stealth Look) */}
      {isModeMenuOpen && (
        <div
          ref={modeMenuRef}
          className="absolute bottom-16 left-10 w-[310px] max-w-[calc(100vw-3rem)] bg-[#0c0d12]/98 backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.8)] space-y-0.5 animate-in fade-in duration-100 z-50 font-sans"
        >
          {FORGE_MODES.map((mode) => {
            const isSelected = selectedMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setSelectedMode(mode.id);
                  setActiveRuntimeMode(mode.id);
                  setIsModeMenuOpen(false);
                }}
                className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-white/[0.08] text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span className="text-sm mt-0.5 shrink-0" style={{ color: mode.accentHex }}>{mode.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-white">{mode.title}</span>
                      {mode.isRecommended && (
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-mono tracking-wider bg-white/[0.06] text-neutral-300 border border-white/[0.08] uppercase font-semibold">
                          RECOMMENDED
                        </span>
                      )}
                    </div>
                    {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                  </div>
                  <p className="text-[10.5px] text-neutral-400 leading-snug mt-0.5 font-normal">
                    {mode.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Rounded Input Capsule */}
      <div className="w-full h-12 sm:h-13 bg-[#0d0e12] hover:bg-[#101216] focus-within:bg-[#111318] border border-white/[0.08] focus-within:border-white/20 rounded-full px-3.5 flex items-center gap-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.65)] backdrop-blur-2xl transition-all">
        
        {/* Minimalist Paperclip */}
        <button
          type="button"
          onClick={() => {
            setIsAttachMenuOpen(!isAttachMenuOpen);
            setIsModeMenuOpen(false);
          }}
          className="w-7 h-7 rounded-full flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-all cursor-pointer select-none active:scale-95 shrink-0"
          title="Attach files or context"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80 hover:opacity-100">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        {/* Hairline Divider */}
        <div className="w-[1px] h-3.5 bg-white/10 shrink-0" />

        {/* Completely Borderless Seamless Mode Selector */}
        <button
          type="button"
          onClick={() => {
            setIsModeMenuOpen(!isModeMenuOpen);
            setIsAttachMenuOpen(false);
          }}
          className="h-7 px-1.5 rounded-lg text-neutral-300 hover:text-white text-xs font-sans flex items-center gap-1.5 transition-all cursor-pointer shrink-0 select-none active:scale-95"
          title="Switch execution engine"
        >
          <span className="text-xs" style={{ color: currentSelectedObj.accentHex }}>{currentSelectedObj.icon}</span>
          <span className="font-medium tracking-tight text-white">{currentSelectedObj.short}</span>
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-neutral-500">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {/* Direct Input */}
        <input
          type="text"
          value={taskInput}
          onChange={(e) => setTaskInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleDispatchTask();
            }
          }}
          placeholder={isListening ? "Listening... speak your directive" : "Deploy execution task, paste script, or target web URL..."}
          disabled={isExecuting}
          className={`flex-1 bg-transparent text-[13px] sm:text-[13.5px] text-white outline-none font-sans px-1 placeholder:text-neutral-500 ${
            isListening ? 'placeholder:text-white animate-pulse' : ''
          }`}
        />

        {/* Speech-to-Text Button */}
        <button
          type="button"
          onClick={toggleVoiceRecording}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 ${
            isListening
              ? 'text-white bg-white/10 border border-white/20 animate-pulse'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
          }`}
          title={isListening ? 'Stop listening (Esc)' : 'Speak directive (Microphone)'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </button>

        {/* Circular Dispatch Button */}
        <button
          type="button"
          onClick={() => handleDispatchTask()}
          disabled={isExecuting || (!taskInput.trim() && attachedFiles.length === 0)}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-95 shrink-0 ${
            taskInput.trim() || attachedFiles.length > 0
              ? 'bg-white hover:bg-neutral-200 text-black shadow-md'
              : 'bg-white/[0.04] text-neutral-600 cursor-not-allowed'
          }`}
          title="Dispatch Mission (Enter)"
        >
          {isExecuting ? (
            <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5" />
              <polyline points="5 12 12 5 19 12" />
            </svg>
          )}
        </button>

      </div>

      {/* Minimalist Disclaimer */}
      <div className="text-center mt-2">
        <span className="text-[10px] font-sans text-neutral-500 select-none">
          Ubair Forge operates in isolated cloud containers • Verify technical outputs
        </span>
      </div>

    </div>
  );

  return (
    <div 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="fixed inset-0 z-[70] bg-[#050608] text-neutral-200 flex flex-col font-sans selection:bg-white/10 selection:text-white animate-in fade-in duration-150 overflow-hidden"
    >
      
      {/* Dynamic Reactive Ambient Aura (Changes color per active mode) */}
      <div 
        className="absolute inset-0 pointer-events-none transition-all duration-700 ease-out z-0"
        style={{ background: activeModeConfig.ambientBg }}
      />

      {/* Drag Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-[#07080d]/85 backdrop-blur-md border-2 border-dashed border-white/20 flex flex-col items-center justify-center pointer-events-none gap-2">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="text-sm font-medium text-white">Drop files anywhere to attach to Forge</span>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
      />

      {/* Hidden Mobile Camera Input */}
      <input
        type="file"
        ref={mobileCameraInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* 1. Header */}
      <header className="h-14 px-4 sm:px-6 border-b border-white/[0.05] flex items-center justify-between shrink-0 select-none bg-black/30 backdrop-blur-xl z-20">
        
        {/* Left: Brand Identity with Mode-Reactive Spark */}
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 flex items-center justify-center transition-colors duration-500" style={{ color: activeModeConfig.accentHex }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-[13.5px] font-semibold tracking-tight text-white font-sans">Ubair Forge</span>
            <span className="text-[11px] text-neutral-500 font-mono hidden md:inline">
              • Autonomous Multi-Agent Mesh
            </span>
          </div>
        </div>

        {/* Right: Capabilities, How It Works, Reset Session & ESC */}
        <div className="flex items-center gap-2">
          
          <button
            type="button"
            onClick={() => setShowCapabilitiesModal(true)}
            className="h-7 px-2.5 rounded-lg text-neutral-400 hover:text-white text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer hover:bg-white/[0.04]"
          >
            <span>Capabilities</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExplainerModal(true)}
            className="h-7 px-2.5 rounded-lg text-neutral-400 hover:text-white text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer hover:bg-white/[0.04]"
          >
            <span>How it works</span>
          </button>

          {sessionSteps.length > 0 && (
            <button
              type="button"
              onClick={handleClearSession}
              disabled={isExecuting}
              className="h-7 px-2.5 rounded-lg text-neutral-400 hover:text-rose-400 text-xs font-sans transition-all cursor-pointer disabled:opacity-30 hover:bg-white/[0.04]"
              title="Reset in-memory session"
            >
              Reset Session
            </button>
          )}

          <div className="h-3 w-[1px] bg-white/[0.08] mx-1" />

          <button
            type="button"
            onClick={onClose}
            className="h-7 px-2.5 rounded-lg text-neutral-400 hover:text-white text-[11px] font-mono transition-all hover:bg-white/[0.04] cursor-pointer"
            title="Exit Forge (Esc)"
          >
            ESC
          </button>
        </div>
      </header>

      {/* 2. Main Fluid Execution Canvas */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 z-10 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10">
        <div className="max-w-3xl mx-auto w-full min-h-full flex flex-col">

          {/* Empty State Hero: Input Centered in Viewport */}
          {sessionSteps.length === 0 && (
            <div className="my-auto flex flex-col items-center justify-center text-center animate-in fade-in duration-200 w-full py-12">
              
              {/* Reactive Geometric Thunder Core with Plasma Charge */}
              <div className="mb-6 relative flex items-center justify-center pointer-events-none select-none">
                <div 
                  className="absolute inset-0 blur-3xl rounded-full w-28 h-28 -ml-3 -mt-3 transition-all duration-700 ease-out" 
                  style={{ background: activeModeConfig.glowRgba }}
                />
                <svg 
                  width="40" 
                  height="40" 
                  viewBox="0 0 24 24" 
                  fill="currentColor"
                  className="relative z-10 transition-colors duration-500 ease-out"
                  style={{ 
                    color: activeModeConfig.accentHex,
                    filter: `drop-shadow(0 0 16px ${activeModeConfig.glowRgba})`
                  }}
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>

              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-white mb-2 font-sans">
                What deep task are we solving today?
              </h2>

              <p className="text-xs sm:text-[13px] text-neutral-400 max-w-md leading-relaxed font-sans mb-2">
                Autonomous code sandbox execution, deep architecture audits, academic research synthesis, and live web inspection.
              </p>

              {/* Centered Input Box When Session Is Empty */}
              {renderInputCapsule(true)}
            </div>
          )}

          {/* Active Execution Nodes Timeline */}
          {sessionSteps.length > 0 && (
            <div className="space-y-6 animate-in fade-in duration-150 pb-32">
              {sessionSteps.map((step) => {
                const nodeModeObj = FORGE_MODES.find((m) => m.id === step.modeId) || FORGE_MODES[0];

                return (
                  <div key={step.id} className="space-y-3">
                    
                    {/* User Directive Card */}
                    <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] shadow-sm backdrop-blur-md">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-semibold text-white font-sans">Directive</span>
                        <span className="text-[10px] font-mono text-neutral-500">{step.timestamp}</span>
                      </div>

                      <p className="text-[13.5px] text-neutral-200 leading-relaxed font-sans whitespace-pre-wrap">
                        {step.userPrompt}
                      </p>

                      {step.attachments && step.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3 pt-2 border-t border-white/[0.04]">
                          {step.attachments.map((att, attIdx) => (
                            <span
                              key={attIdx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] font-mono text-neutral-300"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-60">
                                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              <span>{att.name}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Node Response Card */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-[#090b0e] border border-white/[0.07] shadow-xl space-y-3">
                      <div className="flex items-center justify-between pb-3 border-b border-white/[0.05]">
                        <div className="flex items-center gap-2 text-xs font-mono">
                          <span 
                            className={`w-2 h-2 rounded-full ${step.status === 'running' ? 'animate-ping' : ''}`}
                            style={{ backgroundColor: nodeModeObj.accentHex }}
                          />
                          <span className="font-semibold" style={{ color: nodeModeObj.accentHex }}>{step.detectedMode}</span>
                          <span className="text-neutral-600">·</span>
                          <span className="text-neutral-400">{step.assignedAgent}</span>
                        </div>

                        <div className="flex items-center gap-3">
                          {step.executionTime !== undefined && (
                            <span className="text-[10px] font-mono text-neutral-500">
                              {step.executionTime}s
                            </span>
                          )}

                          {step.status === 'success' && (
                            <button
                              type="button"
                              onClick={() => handleCopyArtifact(step.id, step.output)}
                              className="text-[11px] font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-white/[0.04]"
                            >
                              {copiedId === step.id ? <span className="text-emerald-400">✓ Copied</span> : <span>Copy</span>}
                            </button>
                          )}
                        </div>
                      </div>

                      {step.status === 'running' ? (
                        <div className="py-6 flex items-center justify-center gap-3 font-mono text-xs text-neutral-400">
                          <span 
                            className="w-3.5 h-3.5 border-2 border-white/20 rounded-full animate-spin" 
                            style={{ borderTopColor: nodeModeObj.accentHex }}
                          />
                          <span>Autonomous Agent Node synthesizing live execution payload...</span>
                        </div>
                      ) : (
                        <div className="text-[13.5px] leading-relaxed text-neutral-200">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ node, ...props }: any) => <div className="mb-3 last:mb-0 leading-relaxed font-sans" {...props} />,
                              strong: ({ node, ...props }: any) => <strong className="font-semibold text-white" {...props} />,
                              code: ({ node, className, children, ...props }: any) => {
                                const match = /language-(\w+)/.exec(className || '');
                                const lang = match ? match[1] : '';
                                const isInline = !match && !className;
                                const codeStr = String(children).replace(/\n$/, '');

                                return isInline ? (
                                  <code className="bg-white/[0.08] px-1.5 py-0.5 rounded text-neutral-200 font-mono text-[12px]" {...props}>
                                    {children}
                                  </code>
                                ) : (
                                  <div className="rounded-xl overflow-hidden my-3 border border-white/[0.08] bg-[#050608]">
                                    <div className="px-3 py-1.5 border-b border-white/[0.06] flex items-center justify-between text-[10.5px] font-mono text-neutral-500 bg-white/[0.01]">
                                      <span>{lang || 'code'}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleCopyCodeSnippet(codeStr)}
                                        className="hover:text-white transition-colors cursor-pointer"
                                      >
                                        {copiedCodeSnippet === codeStr ? <span className="text-emerald-400">✓ Copied</span> : <span>Copy</span>}
                                      </button>
                                    </div>
                                    <SyntaxHighlighter
                                      style={vscDarkPlus}
                                      language={lang || 'text'}
                                      PreTag="div"
                                      customStyle={{ margin: 0, padding: '1rem', background: 'transparent', fontSize: '12.5px' }}
                                    >
                                      {codeStr}
                                    </SyntaxHighlighter>
                                  </div>
                                );
                              }
                            }}
                          >
                            {step.output}
                          </ReactMarkdown>
                        </div>
                      )}

                      {/* Follow-up Pills */}
                      {step.status === 'success' && step.suggestedFollowUps && (
                        <div className="pt-3 border-t border-white/[0.04] space-y-1.5">
                          <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 block">
                            Suggested Actions
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {step.suggestedFollowUps.map((suggestion, sIdx) => (
                              <button
                                key={sIdx}
                                type="button"
                                onClick={() => handleDispatchTask(suggestion)}
                                className="px-2.5 py-1 rounded-lg bg-white/[0.02] hover:bg-white/[0.07] border border-white/[0.05] hover:border-white/15 text-neutral-400 hover:text-white text-[11.5px] font-sans transition-all cursor-pointer text-left active:scale-95"
                              >
                                {suggestion}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}

          <div ref={canvasBottomRef} className="h-4" />
        </div>
      </div>

      {/* 3. Docked Bottom Input (Active Only When Session Steps > 0) */}
      {sessionSteps.length > 0 && (
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#050608] via-[#050608]/95 to-transparent pt-10 pb-4 px-4 flex flex-col items-center justify-center pointer-events-none z-30">
          {renderInputCapsule(false)}
        </div>
      )}

      {/* 4. "Capabilities" Modal (Clean Numbered + Real-World Scenarios) */}
      {showCapabilitiesModal && (
        <div 
          className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-100"
          onClick={() => {
            setShowCapabilitiesModal(false);
            setIsLangDropdownOpen(false);
          }}
        >
          <div 
            className="w-full max-w-[500px] bg-[#0c0d10] border border-white/[0.08] rounded-3xl p-6 shadow-2xl space-y-4 my-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-sm">⚡</span>
                <span className="text-sm font-semibold text-white tracking-tight font-sans">
                  Core Engine Capabilities
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowCapabilitiesModal(false);
                  setIsLangDropdownOpen(false);
                }}
                className="text-neutral-500 hover:text-white text-xs cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 relative">
              <h3 className="text-xs font-semibold text-neutral-300 font-sans">
                {activeCapabilities.heading}
              </h3>

              {/* Shared Language Dropdown */}
              <div className="relative" ref={langDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                  className="h-7 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{currentLangObj.label}</span>
                  <span className="text-[9px] opacity-40">▼</span>
                </button>

                <div className={`${isLangDropdownOpen ? 'block' : 'hidden'} absolute right-0 top-9 w-48 max-h-[250px] overflow-y-auto bg-[#121316] border border-white/[0.1] rounded-xl p-1 shadow-2xl z-50 space-y-0.5 animate-in fade-in duration-100 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10`}>
                  {LANG_OPTIONS.map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => {
                        setGuideLang(lang.id);
                        setIsLangDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        guideLang === lang.id
                          ? 'bg-white/[0.1] text-white font-medium'
                          : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <span>{lang.label}</span>
                      <span className="text-[10px] font-mono text-neutral-500">{lang.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Clean Numbered Rows with No Divider Lines */}
            <div className="space-y-3 py-1 font-sans">
              {activeCapabilities.items.map((cap, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-neutral-500 font-semibold">{cap.num}</span>
                    <span className="text-xs">{cap.icon}</span>
                    <span className="text-xs font-semibold text-white">{cap.title}</span>
                  </div>
                  <p className="text-[11.5px] text-neutral-400 leading-relaxed pl-5 font-sans">
                    {cap.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/[0.04]">
              <button
                type="button"
                onClick={() => {
                  setShowCapabilitiesModal(false);
                  setIsLangDropdownOpen(false);
                }}
                className="w-full h-10 rounded-2xl bg-white text-black font-semibold text-xs transition-all hover:bg-neutral-200 cursor-pointer active:scale-95 shadow-md font-sans"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. "How It Works" Modal */}
      {showExplainerModal && (
        <div 
          className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-100"
          onClick={() => {
            setShowExplainerModal(false);
            setIsLangDropdownOpen(false);
          }}
        >
          <div 
            className="w-full max-w-[500px] bg-[#0c0d10] border border-white/[0.08] rounded-3xl p-6 shadow-2xl space-y-4 my-auto relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3.5">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 text-sm">⚡</span>
                <span className="text-sm font-semibold text-white tracking-tight font-sans">
                  Autonomous Execution Pipeline
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowExplainerModal(false);
                  setIsLangDropdownOpen(false);
                }}
                className="text-neutral-500 hover:text-white text-xs cursor-pointer p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 relative">
              <h3 className="text-xs font-semibold text-neutral-300 font-sans">
                {activeGuide.heading}
              </h3>

              {/* Shared Language Dropdown */}
              <div className="relative" ref={langDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsLangDropdownOpen(!isLangDropdownOpen)}
                  className="h-7 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-neutral-300 text-xs font-sans flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>{currentLangObj.label}</span>
                  <span className="text-[9px] opacity-40">▼</span>
                </button>

                <div className={`${isLangDropdownOpen ? 'block' : 'hidden'} absolute right-0 top-9 w-48 max-h-[250px] overflow-y-auto bg-[#121316] border border-white/[0.1] rounded-xl p-1 shadow-2xl z-50 space-y-0.5 animate-in fade-in duration-100 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10`}>
                  {LANG_OPTIONS.map((lang) => (
                    <button
                      key={lang.id}
                      type="button"
                      onClick={() => {
                        setGuideLang(lang.id);
                        setIsLangDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                        guideLang === lang.id
                          ? 'bg-white/[0.1] text-white font-medium'
                          : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <span>{lang.label}</span>
                      <span className="text-[10px] font-mono text-neutral-500">{lang.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Consistent Numbered Steps with Emojis */}
            <div className="space-y-3 py-1 font-sans">
              {activeGuide.steps.map((st, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-neutral-500 font-semibold">{st.num}</span>
                    <span className="text-xs">{st.icon}</span>
                    <span className="text-xs font-semibold text-white">{st.title}</span>
                  </div>
                  <p className="text-[11.5px] text-neutral-400 leading-relaxed pl-5 font-sans">
                    {st.desc}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/[0.04]">
              <button
                type="button"
                onClick={() => {
                  setShowExplainerModal(false);
                  setIsLangDropdownOpen(false);
                }}
                className="w-full h-10 rounded-2xl bg-white text-black font-semibold text-xs transition-all hover:bg-neutral-200 cursor-pointer active:scale-95 shadow-md font-sans"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Built-in Desktop/Web Camera Modal Viewfinder */}
      {isCameraModalOpen && (
        <div 
          className="fixed inset-0 z-[85] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans select-none"
          onClick={closeCameraModal}
        >
          <div 
            className="w-full max-w-[560px] bg-[#0c0d10] border border-white/[0.12] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 relative overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <span className="text-teal-400 text-sm">📸</span>
                <span className="text-[13px] font-medium text-neutral-200 tracking-wide font-sans">
                  Forge Vision Capture
                </span>
              </div>

              <div className="flex items-center gap-2">
                {!capturedSnapshot && !cameraError && !cameraLoading && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = cameraFacingMode === 'user' ? 'environment' : 'user';
                      setCameraFacingMode(next);
                      startHardwareCamera(next);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title="Switch camera front/back"
                  >
                    {cameraFacingMode === 'user' ? 'Front' : 'Rear'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={closeCameraModal}
                  className="text-neutral-500 hover:text-white text-xs font-mono px-2 py-1 rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  Esc
                </button>
              </div>
            </div>

            {/* Viewfinder Display Area */}
            <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/[0.08] flex items-center justify-center">
              {cameraLoading && !cameraError && (
                <div className="flex flex-col items-center gap-2.5">
                  <div className="w-6 h-6 border-2 border-white/20 border-t-teal-400 rounded-full animate-spin" />
                  <span className="text-[11px] font-mono text-neutral-400">Initializing camera feed...</span>
                </div>
              )}

              {cameraError && (
                <div className="p-6 text-center space-y-2">
                  <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-sm font-semibold">
                    !
                  </div>
                  <p className="text-xs text-neutral-300 max-w-[320px] leading-relaxed mx-auto">{cameraError}</p>
                </div>
              )}

              {/* Live Video Feed */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${capturedSnapshot || cameraError || cameraLoading ? 'hidden' : 'block'}`}
              />

              {/* Captured Photo Preview */}
              {capturedSnapshot && (
                <img 
                  src={capturedSnapshot} 
                  alt="Snapshot Preview" 
                  className="w-full h-full object-cover animate-in fade-in duration-100" 
                />
              )}

              {/* Viewfinder Corner Reticle */}
              {!capturedSnapshot && !cameraError && !cameraLoading && (
                <div className="absolute inset-4 pointer-events-none flex flex-col justify-between">
                  <div className="flex justify-between">
                    <div className="w-3 h-3 border-t-2 border-l-2 border-teal-400/60 rounded-tl-sm" />
                    <div className="w-3 h-3 border-t-2 border-r-2 border-teal-400/60 rounded-tr-sm" />
                  </div>
                  <div className="flex justify-between">
                    <div className="w-3 h-3 border-b-2 border-l-2 border-teal-400/60 rounded-bl-sm" />
                    <div className="w-3 h-3 border-b-2 border-r-2 border-teal-400/60 rounded-br-sm" />
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={closeCameraModal}
                className="px-4 py-2 text-xs text-neutral-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              {!capturedSnapshot ? (
                <button
                  type="button"
                  onClick={capturePhoto}
                  disabled={cameraLoading || !!cameraError}
                  className="px-5 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all shadow-md active:scale-95 disabled:opacity-40 flex items-center gap-2 cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Capture Photo</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (capturedSnapshot) URL.revokeObjectURL(capturedSnapshot);
                      setCapturedSnapshot(null);
                      setCapturedBlob(null);
                      startHardwareCamera();
                    }}
                    className="px-4 py-2 text-xs text-neutral-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all cursor-pointer active:scale-95"
                  >
                    Retake
                  </button>
                  <button
                    type="button"
                    onClick={confirmCapturedPhoto}
                    className="px-5 py-2 text-xs font-semibold bg-teal-400 text-black hover:bg-teal-300 rounded-xl transition-all shadow-[0_0_15px_rgba(20,184,166,0.4)] cursor-pointer active:scale-95"
                  >
                    Attach Photo
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}