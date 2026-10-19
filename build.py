import re
t=open('template.html').read()
for k,f in [('DATA','data.js'),('ENGINE','engine.js'),('APP','app.js')]:
    t=t.replace('/*%s*/'%k, open(f).read())
open('index.html','w').write(t)
print(len(t))
