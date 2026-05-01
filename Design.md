# DESIGN.md — Phân tích kiến trúc k8s-multi-kind-platform
 
## Tổng quan hệ thống
 
Lab này xây dựng một hệ thống microservices 2 tầng trên Kubernetes:
 
- **Backend Relay** (NestJS): stateless app, scale theo CPU, kết nối Redis để cache
- **Redis** (redis:7-alpine): stateful database, lưu trữ bền vững, độ ưu tiên cao nhất
Toàn bộ chạy trong Namespace `k8s-platform-lab`, được bảo vệ bởi NetworkPolicy theo mô hình Zero Trust.
 
---
 
## Quan hệ giữa 7 nhóm A–G
 
### Nhóm F (Meta/Namespace) là nền tảng của tất cả
 
Namespace `k8s-platform-lab` phải được tạo **trước tiên** vì mọi resource khác đều thuộc về nó. Đây không chỉ là quy ước — nếu apply manifest có `namespace: k8s-platform-lab` trước khi Namespace tồn tại, K8s sẽ báo lỗi ngay lập tức.
 
```
Namespace (F) ──► tất cả resource khác
```
 
Lý do phân tách file `00-namespace.yaml` riêng và apply đầu tiên chính là để đảm bảo thứ tự phụ thuộc này.
 
---
 
### Nhóm E (RBAC) thiết lập "ai được làm gì"
 
RBAC phải được thiết lập **trước khi** Workload chạy, vì Pod cần ServiceAccount để tồn tại với đúng quyền hạn ngay từ lúc start.
 
```
ServiceAccount ──► Pod (qua spec.serviceAccountName)
Role + RoleBinding ──► ServiceAccount (gán quyền)
```
 
Điểm quan trọng trong lab: `relay-sa` chỉ có quyền `get/list/watch events` trong namespace. Đây là nguyên tắc **least privilege** — không gán `ClusterRole` khi chỉ cần `Role`, không gán quyền `write` khi chỉ cần `read`.
 
Kiểm tra:
```bash
kubectl auth can-i get events \
  --as=system:serviceaccount:k8s-platform-lab:relay-sa \
  -n k8s-platform-lab
# yes
 
kubectl auth can-i delete pods \
  --as=system:serviceaccount:k8s-platform-lab:relay-sa \
  -n k8s-platform-lab
# no
```
 
---
 
### Nhóm B (Storage) cung cấp dữ liệu bền vững cho Workload
 
Storage phải được **khai báo trước hoặc cùng lúc** với Workload sử dụng nó.
 
```
Secret (redis-secret) ──► StatefulSet (inject password qua env)
ConfigMap (relay-config) ──► Deployment (inject host/port qua envFrom)
PVC (volumeClaimTemplates) ──► StatefulSet Pod (mount /data)
PV (auto-provisioned) ──► PVC (Bound)
```
 
Điểm khác biệt giữa Secret và ConfigMap:
 
| | ConfigMap | Secret |
|--|-----------|--------|
| Dữ liệu | Plain text | Base64 encoded |
| Dùng cho | Cấu hình thông thường | Password, token, key |
| RBAC mặc định | Ai có quyền đọc namespace đều đọc được | Cần quyền riêng |
| Production | Có thể commit lên git | **Không bao giờ commit lên git** |
 
**Tại sao StatefulSet dùng `volumeClaimTemplates` thay vì khai báo PVC riêng?**
 
Nếu khai báo PVC riêng và gắn vào StatefulSet, tất cả replica sẽ dùng chung 1 PVC. Với `volumeClaimTemplates`, mỗi Pod (`redis-0`, `redis-1`...) có PVC riêng (`redis-data-redis-0`, `redis-data-redis-1`). Khi Pod bị xóa và tạo lại, nó tự động mount đúng PVC của mình.
 
---
 
### Nhóm A (Workload) là nơi business logic chạy
 
```
Deployment ──► ReplicaSet ──► Pod (relay)
StatefulSet ──► Pod (redis-0) + PVC (redis-data-redis-0)
HPA ──► Deployment (scale dựa trên CPU metrics)
CronJob ──► Job ──► Pod (backup)
```
 
**Tại sao Deployment cho relay, StatefulSet cho Redis?**
 
| | Deployment | StatefulSet |
|--|-----------|-------------|
| Tên Pod | Random (`relay-7d4b-xyz`) | Ổn định (`redis-0`) |
| PVC | Dùng chung hoặc không có | Mỗi Pod có PVC riêng |
| Scale up | Pod mới có thể start theo thứ tự bất kỳ | Pod mới start theo thứ tự (`redis-1` sau `redis-0`) |
| Xóa | Xóa theo thứ tự bất kỳ | Xóa theo thứ tự ngược (`redis-1` trước `redis-0`) |
| Dùng khi | App không lưu state cục bộ | Database, message queue, cache cluster |
 
**Tại sao HPA cần `resources.requests`?**
 
HPA tính phần trăm CPU theo công thức:
 
```
CPU% = actual_cpu_usage / requests.cpu × 100
```
 
Nếu không có `requests.cpu`, mẫu số = 0 → phép chia không xác định → HPA hiển thị `<unknown>` và không thể scale. Đây là nguyên nhân phổ biến nhất khiến HPA không hoạt động.
 
Ngoài ra cần cài `metrics-server` (trong minikube: `minikube addons enable metrics-server`) vì HPA lấy metrics từ đây.
 
---
 
### Nhóm C (Networking) kiểm soát luồng traffic
 
```
Gateway ──► HTTPRoute ──► Service (ClusterIP) ──► Pod
Service (Headless) ──► DNS per-Pod (redis-0.redis-headless...)
EndpointSlice ──► tự động cập nhật khi Pod thay đổi
NetworkPolicy ──► lọc traffic ở tầng Pod
```
 
**Tại sao Redis cần 2 Service?**
 
- `redis-headless` (clusterIP: None): DNS trả về IP trực tiếp của từng Pod. NestJS kết nối tới `redis-0.redis-headless.k8s-platform-lab.svc.cluster.local` để biết chính xác đang nói chuyện với Pod nào. Bắt buộc phải có `serviceName: redis-headless` trong StatefulSet spec.
- `redis` (ClusterIP): Load balance, dùng cho health check hoặc admin tools không quan tâm Pod cụ thể nào.
**Tại sao NetworkPolicy chỉ hoạt động với CNI hỗ trợ?**
 
NetworkPolicy là một **specification** — nó mô tả ý định nhưng không tự enforce. CNI plugin (Calico, Cilium) mới là thành phần thực sự implement firewall rules ở tầng kernel (iptables hoặc eBPF). Minikube mặc định dùng `kindnet` không implement NetworkPolicy, vì vậy phải khởi động với `--cni=calico`.
 
Kiểm tra CNI hiện tại:
```bash
kubectl get pods -n kube-system | grep -E "calico|cilium|flannel|kindnet"
```
 
---
 
### Nhóm D (Policy) bảo vệ hệ thống khi vận hành
 
```
PodDisruptionBudget ──► Deployment/relay (minAvailable: 1)
PriorityClass ──► StatefulSet/redis (value: 1000000)
```
 
**Tại sao PDB quan trọng khi rolling update node hạ tầng?**
 
Tình huống thực tế: cluster có 2 worker nodes, relay có 2 replicas. Vô tình cả 2 Pod relay chạy trên cùng 1 node. Khi engineer `kubectl drain node-1` để vá lỗ hổng bảo mật:
 
- **Không có PDB**: K8s xóa cả 2 Pod relay cùng lúc → 100% downtime cho đến khi Pod mới được schedule sang node khác và start xong (15-30 giây).
- **Có PDB `minAvailable: 1`**: K8s chỉ xóa 1 Pod, chờ Pod mới ở node khác đạt trạng thái `Ready`, rồi mới xóa Pod thứ 2. Zero downtime.
```bash
# Xem PDB có đang cho phép disruption không
kubectl get pdb -n k8s-platform-lab
# ALLOWED DISRUPTIONS = 1 nghĩa là có thể xóa 1 Pod an toàn
```
 
**Tại sao PriorityClass cho Redis có value = 1,000,000?**
 
K8s scheduler có thể evict Pod khi node thiếu tài nguyên (OOM). Thứ tự evict dựa trên Priority value — thấp hơn bị evict trước. Built-in `system-cluster-critical` có value 2,000,001,000. Đặt Redis ở 1,000,000 đảm bảo nó được ưu tiên giữ lại hơn các app thông thường (default priority = 0).
 
---
 
### Nhóm G — Sơ đồ quan hệ tổng thể
 
```
┌─────────────────────────────────────────────────────────────────┐
│ Namespace: k8s-platform-lab                                     │
│                                                                 │
│  [F: Meta]          [E: RBAC]                                   │
│  ConfigMap ─────►  ServiceAccount (relay-sa)                    │
│  Secret             └── Role + RoleBinding                      │
│    │                       │                                    │
│    ▼                       ▼                                    │
│  [A: Workload]      [A: Workload]                               │
│  StatefulSet        Deployment (relay)                          │
│  (redis-0)          ├── serviceAccountName: relay-sa            │
│    │                ├── envFrom: ConfigMap                      │
│    │                ├── env: Secret                             │
│    │                └── scaled by HPA                           │
│    │                       │                                    │
│  [B: Storage]       [D: Policy]                                 │
│  PVC (redis-data)   PodDisruptionBudget                         │
│  PV                 PriorityClass ──► StatefulSet               │
│                                                                 │
│  [C: Networking]                                                │
│  Gateway ──► HTTPRoute ──► Service(relay) ──► Pod(relay)        │
│  Service(redis-headless) ──► DNS ──► redis-0                    │
│  NetworkPolicy: default-deny → allow relay→redis                │
│                                                                 │
│  [A: Workload batch]                                            │
│  CronJob ──► Job ──► Pod(backup, label:app=relay)               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
 
---
 
## Các vấn đề thực tế gặp phải trong lab và cách giải quyết
 
### 1. NetworkPolicy không hoạt động trên minikube mặc định
 
**Nguyên nhân:** Minikube dùng `kindnet` CNI không enforce NetworkPolicy.
 
**Giải pháp:**
```bash
minikube delete
minikube start --cni=calico --driver=docker
```
 
**Bài học:** NetworkPolicy là specification, CNI plugin mới là implementation. Luôn kiểm tra CNI trước khi test security policy.
 
---
 
### 2. HPA hiển thị `<unknown>`
 
**Nguyên nhân 1:** Chưa cài metrics-server.
```bash
minikube addons enable metrics-server
```
 
**Nguyên nhân 2:** Pod không chạy được (ImagePullBackOff) nên không có metrics.
```bash
kubectl get pods -n k8s-platform-lab  # kiểm tra status
```
 
**Nguyên nhân 3:** Deployment thiếu `resources.requests.cpu`.
 
**Bài học:** HPA phụ thuộc vào 3 thứ: metrics-server chạy, Pod đang chạy, và `resources.requests` được khai báo.
 
---
 
### 3. ImagePullBackOff khi dùng local image với minikube
 
**Nguyên nhân:** Minikube chạy trong VM riêng, không thấy Docker images của máy host.
 
**Giải pháp:**
```bash
# Build image
docker build -t relay:1.0.0 -f apps/relay/Dockerfile apps/relay/
 
# Load vào minikube
minikube image load relay:1.0.0
 
# Thêm imagePullPolicy: Never trong manifest
```
 
**Bài học:** Trong production, dùng container registry (Docker Hub, ECR, GCR). Trong local dev với minikube, phải `minikube image load` hoặc dùng `eval $(minikube docker-env)` trước khi build.
 
---
 
### 4. Redis password không được expand trong `command`
 
**Nguyên nhân:** `$(REDIS_PASSWORD)` trong `command` array không expand như trong shell.
 
**Giải pháp:** Dùng `sh -c`:
```yaml
command: ["sh", "-c"]
args:
  - redis-server --requirepass "$REDIS_PASSWORD"
```
 
**Bài học:** K8s `command` và `args` không chạy qua shell mặc định. Phải explicit dùng `sh -c` nếu cần shell expansion.
 
---
 
## Checklist vận hành
 
```bash
# Xác minh toàn bộ hệ thống
kubectl get all -n k8s-platform-lab
kubectl get pvc,pdb,hpa,networkpolicy,priorityclass -n k8s-platform-lab
 
# RBAC
kubectl auth can-i get events \
  --as=system:serviceaccount:k8s-platform-lab:relay-sa \
  -n k8s-platform-lab
# → yes
 
# HPA đọc được metrics
kubectl get hpa -n k8s-platform-lab
# → cpu: X%/50% (không phải <unknown>)
 
# Redis có PriorityClass
kubectl describe pod redis-0 -n k8s-platform-lab | grep -i priority
# → Priority: 1000000, PriorityClassName: critical-data
 
# PVC Bound
kubectl get pvc -n k8s-platform-lab
# → STATUS: Bound
 
# NetworkPolicy hoạt động (cần CNI=calico)
kubectl run intruder --image=busybox:1.36 -n k8s-platform-lab -- sleep 3600
kubectl exec -n k8s-platform-lab intruder -- \
  nc -zv redis-0.redis-headless.k8s-platform-lab.svc.cluster.local 6379
# → timeout (bị block)
kubectl delete pod intruder -n k8s-platform-lab
```