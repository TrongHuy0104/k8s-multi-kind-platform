# Bản đồ 80 Kind — k8s-multi-kind-platform
 
> Tài liệu này liệt kê 20+ Kubernetes Kind được sử dụng hoặc tham chiếu trong lab,
> phân theo 7 nhóm A–G. Mỗi Kind kèm mô tả ngắn, lý do sử dụng và ví dụ lệnh kiểm tra.
 
---
 
## Nhóm A — Workload (Chạy ứng dụng)
 
> Nhóm này trả lời câu hỏi: **"Ứng dụng chạy như thế nào?"**
 
| Kind | API Group | Dùng trong lab | Mô tả |
|------|-----------|---------------|-------|
| `Deployment` | `apps/v1` | ✅ Backend Relay | Quản lý stateless app, rolling update, rollback. Tạo và giám sát ReplicaSet bên dưới. |
| `StatefulSet` | `apps/v1` | ✅ Redis | Quản lý stateful app. Pod có tên ổn định (`redis-0`), PVC được giữ lại khi Pod restart. |
| `ReplicaSet` | `apps/v1` | ⚙️ Tự động tạo bởi Deployment | Đảm bảo số lượng Pod replicas. Không nên tạo tay — để Deployment quản lý. |
| `HorizontalPodAutoscaler` | `autoscaling/v2` | ✅ relay-hpa | Tự động scale số Pod theo CPU/memory. **Bắt buộc phải có `resources.requests` trong container, nếu không HPA hiện `<unknown>`.** Cần metrics-server (`minikube addons enable metrics-server`). |
| `DaemonSet` | `apps/v1` | 📖 Tham chiếu | Chạy đúng 1 Pod trên mỗi Node. Dùng cho log collector, monitoring agent (Fluentd, Prometheus node-exporter). |
| `Job` | `batch/v1` | ✅ redis-backup (one-time) | Chạy tác vụ đến khi hoàn thành rồi dừng. Khác Deployment ở chỗ Pod không restart sau khi success. |
| `CronJob` | `batch/v1` | ✅ redis-backup (định kỳ) | Tạo Job theo lịch cron. Dùng cho backup, cleanup log định kỳ. |
 
---
 
## Nhóm B — Storage (Lưu trữ bền vững)
 
> Nhóm này trả lời câu hỏi: **"Data ở đâu và tồn tại bao lâu?"**
 
| Kind | API Group | Dùng trong lab | Mô tả |
|------|-----------|---------------|-------|
| `PersistentVolume` | `v1` | ⚙️ Tự động tạo bởi StorageClass | Đại diện cho một đơn vị storage thực tế (disk, NFS, cloud volume). Tồn tại độc lập với Pod và Namespace. |
| `PersistentVolumeClaim` | `v1` | ✅ redis-data (qua volumeClaimTemplates) | Yêu cầu storage từ PV. StatefulSet tạo 1 PVC riêng cho mỗi Pod replica. **PVC ở trạng thái `Bound` nghĩa là đã được cấp phát thành công.** |
| `StorageClass` | `storage.k8s.io/v1` | ⚙️ standard (minikube mặc định) | Định nghĩa loại storage và cách cấp phát động. Minikube dùng `standard` với `hostPath`. |
| `VolumeSnapshot` | `snapshot.storage.k8s.io/v1` | 📖 Tham chiếu | Tạo snapshot tại một thời điểm của PVC. **Cần cài VolumeSnapshot CRD và snapshot controller riêng — không có sẵn trong minikube mặc định.** |
| `ConfigMap` | `v1` | ✅ relay-config | Lưu cấu hình không nhạy cảm (host, port). Inject vào Pod qua `envFrom` hoặc volume mount. |
| `Secret` | `v1` | ✅ redis-secret | Lưu thông tin nhạy cảm (password, token) dưới dạng base64. **Không commit Secret YAML lên git — dùng Sealed Secrets hoặc External Secrets trong production.** |
 
---
 
## Nhóm C — Networking (Kết nối mạng)
 
> Nhóm này trả lời câu hỏi: **"Traffic đi vào và ra như thế nào?"**
 
| Kind | API Group | Dùng trong lab | Mô tả |
|------|-----------|---------------|-------|
| `Service` (ClusterIP) | `v1` | ✅ relay-service, redis | Expose Pod ra bên trong cluster qua IP ổn định. Load balance traffic đến các Pod theo label selector. |
| `Service` (Headless) | `v1` | ✅ redis-headless | `clusterIP: None` — không load balance, DNS trả về IP từng Pod. **Bắt buộc cho StatefulSet** để tạo DNS record `redis-0.redis-headless.<namespace>.svc.cluster.local`. |
| `Endpoints` | `v1` | ⚙️ Tự động tạo bởi Service | Lưu danh sách IP:Port của các Pod khớp với selector của Service. Kiểm tra bằng `kubectl get endpoints`. |
| `EndpointSlice` | `discovery.k8s.io/v1` | ⚙️ Tự động tạo bởi Service | Phiên bản mới hơn của Endpoints, hỗ trợ cluster lớn tốt hơn. Tự động tạo khi tạo Service. |
| `Ingress` | `networking.k8s.io/v1` | 📖 Thay thế bởi Gateway API | Route HTTP traffic từ ngoài vào Service. Cần Ingress Controller (nginx, traefik). |
| `IngressClass` | `networking.k8s.io/v1` | 📖 Tham chiếu | Xác định controller nào xử lý Ingress resource. |
| `Gateway` | `gateway.networking.k8s.io/v1` | ✅ platform-gateway | Thế hệ mới thay thế Ingress. Phân tách vai trò: platform admin quản lý Gateway, dev quản lý HTTPRoute. **Cần cài Gateway Controller (nginx-gateway, istio).** |
| `HTTPRoute` | `gateway.networking.k8s.io/v1` | ✅ relay-route | Định nghĩa routing rule cho HTTP traffic. Gắn vào Gateway qua `parentRefs`. |
| `NetworkPolicy` | `networking.k8s.io/v1` | ✅ default-deny-all, allow-relay-to-redis | Firewall ở tầng Pod. **Chỉ hoạt động khi CNI hỗ trợ (Calico, Cilium). Minikube và kind mặc định dùng CNI không enforce NetworkPolicy — phải khởi động lại với `--cni=calico`.** |
 
---
 
## Nhóm D — Policy (Chính sách vận hành)
 
> Nhóm này trả lời câu hỏi: **"Hệ thống được bảo vệ khỏi sự cố vận hành như thế nào?"**
 
| Kind | API Group | Dùng trong lab | Mô tả |
|------|-----------|---------------|-------|
| `PodDisruptionBudget` | `policy/v1` | ✅ relay-pdb | Giới hạn số Pod bị xóa cùng lúc khi `kubectl drain` node. **Nếu không có PDB, drain node có thể xóa toàn bộ replicas cùng lúc gây downtime.** `minAvailable: 1` đảm bảo luôn có ít nhất 1 Pod chạy. |
| `PriorityClass` | `scheduling.k8s.io/v1` | ✅ critical-data (value: 1000000) | Đặt độ ưu tiên cho Pod. Khi node thiếu RAM, K8s evict Pod có priority thấp trước. **Redis cần priority cao nhất để không bị evict trước các app thông thường.** |
| `LimitRange` | `v1` | 📖 Tham chiếu | Đặt default và max resource cho Pod/Container trong Namespace. Phòng trường hợp dev quên khai báo `resources`. |
| `ResourceQuota` | `v1` | 📖 Tham chiếu | Giới hạn tổng tài nguyên (CPU, memory, số Pod) được dùng trong một Namespace. Dùng trong môi trường multi-tenant. |
| `RuntimeClass` | `node.k8s.io/v1` | 📖 Nice-to-have | Chọn container runtime (gVisor, Kata Containers) cho Pod. Tăng bảo mật bằng cách cô lập kernel. |
 
---
 
## Nhóm E — RBAC (Phân quyền)
 
> Nhóm này trả lời câu hỏi: **"Ai được làm gì trong cluster?"**
 
| Kind | API Group | Dùng trong lab | Mô tả |
|------|-----------|---------------|-------|
| `ServiceAccount` | `v1` | ✅ relay-sa | Định danh cho Pod khi gọi K8s API. **Mỗi app nên có ServiceAccount riêng** thay vì dùng `default` SA — tuân theo nguyên tắc least privilege. |
| `Role` | `rbac.authorization.k8s.io/v1` | ✅ relay-event-reader | Tập hợp quyền trong một Namespace cụ thể. Dùng `Role` thay vì `ClusterRole` khi không cần quyền cluster-wide. |
| `RoleBinding` | `rbac.authorization.k8s.io/v1` | ✅ relay-event-reader-binding | Gán Role cho ServiceAccount/User/Group trong một Namespace. |
| `ClusterRole` | `rbac.authorization.k8s.io/v1` | 📖 Tham chiếu | Tập hợp quyền áp dụng toàn cluster hoặc cho non-namespaced resources (Node, PV). |
| `ClusterRoleBinding` | `rbac.authorization.k8s.io/v1` | 📖 Tham chiếu | Gán ClusterRole cho subject ở cấp cluster. |
 
**Kiểm tra quyền:**
```bash
kubectl auth can-i get events \
  --as=system:serviceaccount:k8s-platform-lab:relay-sa \
  -n k8s-platform-lab
# Kết quả: yes
```
 
---
 
## Nhóm F — Meta (Quản trị & Quan sát)
 
> Nhóm này trả lời câu hỏi: **"Cluster được tổ chức và quan sát như thế nào?"**
 
| Kind | API Group | Dùng trong lab | Mô tả |
|------|-----------|---------------|-------|
| `Namespace` | `v1` | ✅ k8s-platform-lab | Cô lập tài nguyên. `kubectl delete namespace` xóa sạch toàn bộ tài nguyên bên trong — tiện cho lab. |
| `Node` | `v1` | 📖 Quan sát | Đại diện cho máy chủ vật lý/VM trong cluster. Kiểm tra bằng `kubectl get nodes -o wide`. |
| `Event` | `v1` | ✅ relay-sa có quyền đọc | Ghi lại các sự kiện trong cluster (Pod scheduled, image pulled, lỗi...). Dùng `kubectl get events --watch` để debug real-time. |
| `CustomResourceDefinition` | `apiextensions.k8s.io/v1` | ✅ StarCiApp CRD | Mở rộng K8s API với resource tùy chỉnh. Là nền tảng của mọi K8s operator (ArgoCD, Prometheus, Istio đều dùng CRD). |
| `MutatingWebhookConfiguration` | `admissionregistration.k8s.io/v1` | 📖 Tham chiếu | Tự động inject sidecar (Istio envoy) hoặc modify resource trước khi lưu vào etcd. |
| `ValidatingWebhookConfiguration` | `admissionregistration.k8s.io/v1` | 📖 Tham chiếu | Validate resource trước khi tạo. Dùng để enforce policy (không cho tạo Pod không có `requests`). |
 
---
 
## Nhóm G — Map tổng hợp
 
> Quan hệ phụ thuộc giữa các Kind trong lab này:
 
```
[Namespace]
    │
    ├── [ServiceAccount: relay-sa]
    │       └── [Role] ←── [RoleBinding]
    │
    ├── [ConfigMap: relay-config]
    ├── [Secret: redis-secret]
    │
    ├── [PriorityClass: critical-data]
    │
    ├── [StatefulSet: redis]
    │       ├── uses → [Secret] (password)
    │       ├── uses → [PriorityClass]
    │       ├── creates → [Pod: redis-0]
    │       └── creates → [PVC: redis-data-redis-0]
    │               └── binds → [PV] (từ StorageClass)
    │
    ├── [Service: redis-headless] ←── DNS cho redis-0
    ├── [Service: redis] ←── ClusterIP cho admin
    │
    ├── [Deployment: relay]
    │       ├── uses → [ServiceAccount: relay-sa]
    │       ├── uses → [ConfigMap] + [Secret]
    │       ├── creates → [ReplicaSet]
    │       │       └── creates → [Pod: relay-xxx] × 2
    │       └── scaled by → [HPA: relay-hpa]
    │
    ├── [Service: relay-service] ←── ClusterIP cho relay
    │       └── auto-creates → [EndpointSlice]
    │
    ├── [Gateway: platform-gateway]
    │       └── routes via → [HTTPRoute: relay-route] → [Service: relay-service]
    │
    ├── [PodDisruptionBudget: relay-pdb] ←── bảo vệ Deployment/relay
    │
    ├── [NetworkPolicy: default-deny-all]
    ├── [NetworkPolicy: allow-relay-to-redis]
    ├── [NetworkPolicy: allow-gateway-to-relay]
    │
    └── [CronJob: redis-backup]
            └── creates → [Job] → [Pod] (label: app=relay để qua NetworkPolicy)
```
 
---
 
## Bảng tổng hợp 26 Kind
 
| # | Kind | Nhóm | Trạng thái trong lab |
|---|------|-------|---------------------|
| 1 | Namespace | F | ✅ Triển khai |
| 2 | ServiceAccount | E | ✅ Triển khai |
| 3 | Role | E | ✅ Triển khai |
| 4 | RoleBinding | E | ✅ Triển khai |
| 5 | ConfigMap | B | ✅ Triển khai |
| 6 | Secret | B | ✅ Triển khai |
| 7 | PriorityClass | D | ✅ Triển khai |
| 8 | StatefulSet | A | ✅ Triển khai |
| 9 | PersistentVolumeClaim | B | ✅ Triển khai (auto) |
| 10 | PersistentVolume | B | ✅ Triển khai (auto) |
| 11 | StorageClass | B | ✅ Dùng mặc định |
| 12 | Service (Headless) | C | ✅ Triển khai |
| 13 | Service (ClusterIP) | C | ✅ Triển khai |
| 14 | Deployment | A | ✅ Triển khai |
| 15 | ReplicaSet | A | ✅ Triển khai (auto) |
| 16 | HorizontalPodAutoscaler | A | ✅ Triển khai |
| 17 | EndpointSlice | C | ✅ Triển khai (auto) |
| 18 | Gateway | C | ✅ Triển khai |
| 19 | HTTPRoute | C | ✅ Triển khai |
| 20 | NetworkPolicy | C | ✅ Triển khai |
| 21 | PodDisruptionBudget | D | ✅ Triển khai |
| 22 | CronJob | A | ✅ Triển khai |
| 23 | Job | A | ✅ Triển khai (auto) |
| 24 | Event | F | ✅ Quan sát |
| 25 | CustomResourceDefinition | F | ✅ Triển khai |
| 26 | Node | F | ✅ Quan sát |
 
---
 
*Ghi chú: ✅ = có trong lab | ⚙️ = tự động tạo | 📖 = tham chiếu/tài liệu*
 