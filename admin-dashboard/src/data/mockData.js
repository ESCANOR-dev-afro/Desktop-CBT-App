// Granular Class Hierarchy & Arm Mapping Definition
export const classHierarchy = {
  'JSS 1': ['JSS 1 Gold', 'JSS 1 Silver', 'JSS 1 Diamond'],
  'JSS 2': ['JSS 2 Gold', 'JSS 2 Silver', 'JSS 2 Diamond'],
  'JSS 3': ['JSS 3 Gold', 'JSS 3 Silver', 'JSS 3 Diamond'],
  'SS 1': ['SS 1 Science', 'SS 1 Art', 'SS 1 Commercial'],
  'SS 2': ['SS 2 Science', 'SS 2 Art', 'SS 2 Commercial'],
  'SS 3': ['SS 3 Science', 'SS 3 Art', 'SS 3 Commercial'],
};

export const allClassArms = Object.values(classHierarchy).flat();

// Helper curriculum builders
const buildCurriculum = (names, prefix, category) =>
  names.map((name, idx) => ({
    id: `${prefix}-${idx + 1}`,
    name,
    teacher: `${category} Department`,
    questionsCount: 45,
    category,
  }));

const junior16List = buildCurriculum(
  [
    'English Language',
    'Mathematics',
    'Yoruba',
    'French',
    'Fine Art',
    'Music',
    'Basic Science',
    'Basic Technology',
    'PHE',
    'Digital Technology',
    'Social Studies',
    'Civic Education',
    'Home Economics',
    'Agricultural Science',
    'Business Studies',
    'History',
  ],
  'jss',
  'Junior Core'
);

const scienceList = buildCurriculum(
  [
    'Mathematics',
    'English Language',
    'Biology',
    'Chemistry',
    'Physics',
    'Civic Education',
    'Further Mathematics',
    'Economics',
    'Digital Technology',
    'Geography',
    'Agricultural Science',
  ],
  'sci',
  'Sciences'
);

const commercialList = buildCurriculum(
  [
    'Mathematics',
    'English Language',
    'Civic Education',
    'Further Mathematics',
    'Economics',
    'Digital Technology',
    'Account',
    'Commerce',
  ],
  'com',
  'Commercial'
);

const artsList = buildCurriculum(
  [
    'Mathematics',
    'English Language',
    'Civic Education',
    'Economics',
    'Digital Technology',
    'Government',
    'CRS',
    'Literature in English',
  ],
  'art',
  'Arts'
);

// Initial isolated subjects per class and arm stream
export const initialSubjectsByClass = {
  'JSS 1': junior16List,
  'JSS 1 Gold': junior16List,
  'JSS 1 Silver': junior16List,
  'JSS 1 Diamond': junior16List,

  'JSS 2': junior16List,
  'JSS 2 Gold': junior16List,
  'JSS 2 Silver': junior16List,
  'JSS 2 Diamond': junior16List,

  'JSS 3': junior16List,
  'JSS 3 Gold': junior16List,
  'JSS 3 Silver': junior16List,
  'JSS 3 Diamond': junior16List,

  'SS 1': scienceList,
  'SS 1 Science': scienceList,
  'SS 1 Commercial': commercialList,
  'SS 1 Art': artsList,
  'SS 1 Arts': artsList,

  'SS 2': scienceList,
  'SS 2 Science': scienceList,
  'SS 2 Commercial': commercialList,
  'SS 2 Art': artsList,
  'SS 2 Arts': artsList,

  'SS 3': scienceList,
  'SS 3 Science': scienceList,
  'SS 3 Commercial': commercialList,
  'SS 3 Art': artsList,
  'SS 3 Arts': artsList,
};

// Initial student roster per class & arm stream
export const initialStudents = [];

// Initial Questions Bank
export const initialQuestions = {};

// Initial Workstations for Live CBT Monitor
export const initialWorkstations = [];

// Audit Activity Logs
export const activityLogs = [
  { id: '1', time: '13:00:00', event: 'CBT System Engine Initialized in Production Mode', category: 'System' }
];

