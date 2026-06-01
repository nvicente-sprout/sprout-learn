/**
 * app.js — Sprout Learn
 * Sprout Solutions | Native LMS — Vanilla JS SPA
 */

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://jwdumjludmjuufqhzysk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3ZHVtamx1ZG1qdXVmcWh6eXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MTMzNjcsImV4cCI6MjA4OTM4OTM2N30.kPXVHsFBBOvYgiDAP-LatzX4oiM4huhHyMFN1YKcfCk';
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Gemini key is server-side only — calls go through /api/generate-questions

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ─── Initial Data ─────────────────────────────────────────────────────────────
const USER_COLORS = ['#1B3A1B','#2d5a2d','#3a7a3a','#4a9e4a','#1565c0','#6a1b9a','#e65100','#880e4f','#00695c','#4e342e'];
let allUsers = [];

const CATEGORIES = [
  'Leadership & Management', 'HR & Compliance', 'Partner Solutions',
  'Sprout Product Training', 'Uploaded Content', 'Other',
];
const CAT_EMOJI = {
  'Leadership & Management': '🎯', 'HR & Compliance': '📋',
  'Partner Solutions': '🤝', 'Sprout Product Training': '🌱',
  'Uploaded Content': '📄', 'Other': '📚',
};

const DEFAULT_COURSES = [
  { id: 'c1', title: 'Effective Leadership Fundamentals',    category: 'Leadership & Management', type: 'Free', contentType: 'none',    totalPages: 0, description: 'Build the foundational skills of effective leadership in the modern workplace.' },
  { id: 'c2', title: 'Philippine Labor Law Basics',          category: 'HR & Compliance',         type: 'Free', contentType: 'none',    totalPages: 0, description: 'Understand the key provisions of Philippine labor law and employee rights.' },
  { id: 'c3', title: 'Data Privacy in the Workplace',        category: 'HR & Compliance',         type: 'Free', contentType: 'none',    totalPages: 0, description: 'Learn how to protect employee and customer data under the Data Privacy Act.' },
  { id: 'c4', title: 'Manatal ATS Demo',                     category: 'Partner Solutions',        type: 'Free', contentType: 'youtube', totalPages: 0, youtubeId: 'VjinpYMUMoc', description: 'Explore Manatal\'s Applicant Tracking System with a live product demo.' },
  { id: 'c5', title: 'Conflict Resolution at Work',          category: 'Leadership & Management', type: 'Free', contentType: 'none',    totalPages: 0, description: 'Practical strategies for managing and resolving workplace conflict.' },
  { id: 'c6', title: 'Employee Onboarding Best Practices',   category: 'HR & Compliance',         type: 'Paid', contentType: 'none',    totalPages: 0, description: 'Design effective onboarding programs that set new hires up for success.' },
];
let courses = [];

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser   = null;
let currentRoute  = '';
let adminViewingAsLearner = false;
let assignments   = {};  // { userId: [courseId, ...] }
let progress      = {};  // { 'userId_courseId': { currentSlide, completed, score, passed } }
let questions     = {};  // { courseId: [...] }
let viewerPdfDoc    = null;
let viewerPage      = 1;
let viewerCourseId  = null;
let _pdfKeyHandler  = null;

// Assessment state
let assessmentAnswers  = [];
let assessmentCurrentQ = 0;
let assessmentCourseId = null;

let allTeams = [];
let notifications = [];
let flappyScores  = [];
let _flappyGame   = null;
let scormZipData  = null; // { zip, launchFile, fileCount }
let siteSettings  = { activeGame: 'sprout_runner' };
let duckScores    = [];
let _duckGame     = null;
let learningPaths = [];
let _pathCourseIds = []; // path builder state

