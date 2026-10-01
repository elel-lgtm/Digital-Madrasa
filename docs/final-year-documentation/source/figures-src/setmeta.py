import sys, pymupdf
d = pymupdf.open(sys.argv[1])
d.set_metadata({'title': 'Digital Madrasa, an Integrated Application That Will Manage Madrasas in Kenya',
                'author': '[STUDENT FULL NAME] ([REGISTRATION NUMBER])',
                'subject': 'BSc Computer Science final-year project report, Umma University',
                'keywords': 'Digital Madrasa; madrasa management; Supabase; React Native; Row Level Security; Kenya',
                'creator': 'Microsoft Word', 'producer': d.metadata.get('producer', '')})
d.saveIncr(); print('  metadata set:', d.metadata['title'])
