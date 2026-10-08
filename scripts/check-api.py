import json
import time
import urllib.request
import urllib.error

origin = 'http://127.0.0.1:8788'
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
owner = {'oai-authenticated-user-id': 'local-owner-test', 'oai-authenticated-user-email': 'smiling.slime.47@gmail.com'}

def call(path, method='GET', body=None, headers=None):
    request_headers = {'Origin': origin, **(headers or {})}
    data = json.dumps(body).encode() if body is not None else None
    if data is not None:
        request_headers['Content-Type'] = 'application/json'
    request = urllib.request.Request(origin + path, data=data, method=method, headers=request_headers)
    try:
        with opener.open(request, timeout=20) as response:
            return response.status, json.loads(response.read())
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())

for attempt in range(30):
    try:
        status, result = call('/api/posts')
        break
    except urllib.error.URLError:
        time.sleep(1)
else:
    raise RuntimeError('测试服务启动失败')

assert status == 200, result
assert result['total'] == 211 and len(result['items']) == 10, result
status, second = call('/api/posts?page=2')
assert status == 200 and not ({p['id'] for p in result['items']} & {p['id'] for p in second['items']})
assert call('/api/posts?pageSize=999')[0] == 400
assert call('/api/admin/posts')[0] == 401
assert call('/api/admin/posts', headers={'oai-authenticated-user-id':'other-user','oai-authenticated-user-email':'other@example.com'})[0] == 403
assert call('/api/admin/session', headers=owner)[0] == 200
status, bootstrap = call('/api/admin/bootstrap', headers=owner)
assert status == 200 and bootstrap['session']['email'] == owner['oai-authenticated-user-email'] and bootstrap['total'] == 211
assert call('/api/admin/bootstrap')[0] == 401
post = {'id':'test/api-check.md','title':'接口验证文章','category':'test','tags':['验证'],'content':'## 标题\n\n测试正文。','publishedAt':'2026-10-08','status':'draft'}
status, saved = call('/api/admin/post', 'POST', post, owner)
assert status == 201, saved
assert call('/api/post?id=test%2Fapi-check.md')[0] == 404
post.update(status='published', version=saved['version'])
status, saved = call('/api/admin/post', 'PUT', post, owner)
assert status == 200, saved
assert call('/api/post?id=test%2Fapi-check.md')[0] == 200
assert call('/api/admin/post', 'PUT', post, owner)[0] == 409
assert call('/api/admin/post', 'PUT', {**post,'version':saved['version']}, {**owner,'Origin':'https://other.example'})[0] == 403
assert call('/api/admin/post?id=test%2Fapi-check.md&version='+str(saved['version']), 'DELETE', headers=owner)[0] == 200
assert call('/api/post?id=test%2Fapi-check.md')[0] == 404
assert call('/api/posts')[1]['total'] == 211
for route in ['/', '/posts', '/about', '/admin']:
    with opener.open(origin+route) as response:
        assert response.status==200 and b'id="app"' in response.read()
print('通过：211 篇导入、分页不重复、参数校验、匿名及非管理员拒绝、草稿隔离、发布、版本冲突、跨站请求拒绝、删除、页面路由。')
