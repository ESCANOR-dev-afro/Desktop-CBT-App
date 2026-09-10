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

const junior20List = buildCurriculum(
  [
    'English Language',
    'Mathematics',
    'Civic Education',
    'Social Studies',
    'Yoruba',
    'Music',
    'French',
    'Digital Technology',
    'Computer Hardware and GSM repair',
    'Horticulture',
    'Home Economics',
    'Agriculture',
    'Oral English',
    'Intermediate Science',
    'Basic Science',
    'Basic Tech',
    'CRS',
    'Business Studies',
    'PHE',
    'Nigeria History',
  ],
  'jss',
  'Junior Core'
);

const scienceList = buildCurriculum(
  [
    'English Language',
    'Mathematics',
    'Physics',
    'Chemistry',
    'Biology',
    'Economics',
    'Further Mathematics',
    'Digital Technology',
    'ICT',
    'Oral English',
    'Geography',
    'Civic Education',
    'Agric',
    'Horticulture and crop production',
    'Computer hardware and GSM repair',
    'Catering craft',
  ],
  'sci',
  'Sciences'
);

const commercialList = buildCurriculum(
  [
    'English Language',
    'Mathematics',
    'Account',
    'Commerce',
    'Government',
    'Economics',
    'Further Mathematics',
    'Digital Technology',
    'ICT',
    'Oral English',
    'Civic Education',
    'Marketing',
    'Catering craft',
  ],
  'com',
  'Commercial'
);

const artsList = buildCurriculum(
  [
    'English Language',
    'Mathematics',
    'Literature',
    'CRS',
    'Government',
    'Economics',
    'Digital Technology',
    'ICT',
    'Oral English',
    'Yoruba',
    'Civic Education',
    'Catering craft',
  ],
  'art',
  'Arts'
);

// Initial isolated subjects per class and arm stream
export const initialSubjectsByClass = {
  'JSS 1': junior20List,
  'JSS 1 Gold': junior20List,
  'JSS 1 Silver': junior20List,
  'JSS 1 Diamond': junior20List,

  'JSS 2': junior20List,
  'JSS 2 Gold': junior20List,
  'JSS 2 Silver': junior20List,
  'JSS 2 Diamond': junior20List,

  'JSS 3': junior20List,
  'JSS 3 Gold': junior20List,
  'JSS 3 Silver': junior20List,
  'JSS 3 Diamond': junior20List,

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

