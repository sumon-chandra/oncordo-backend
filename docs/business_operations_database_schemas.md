# Database Schema Documentation

## Multi-Tenant Business Operations Management Platform

**Document purpose:** Define the initial relational database design for
a multi-tenant SaaS platform that manages the daily operations of
physical businesses.

**Initial business verticals** - Indoor sports facilities: badminton,
table tennis, futsal, basketball, squash, and similar venues. - Training
centers and coaching institutes: programming, language, academic
coaching, professional skills, music, arts, and vocational training.

**Technology direction:** PostgreSQL, Prisma ORM, TypeScript,
Express.js, and Bun.

**Status:** Logical schema specification. This document describes
entities, fields, relationships, constraints, and implementation rules.
It is not a Prisma schema file and does not include an ERD.

------------------------------------------------------------------------

## 1. Product and data-modeling principles

The platform is an operations management system for physical businesses.
Online booking is one way a customer enters the business workflow;
walk-ins, attendance, staff operations, resource allocation, and
payments are equally important.

The following concepts must remain separate:

  ---------------------------------------------------------------------
  Concept                            Meaning
  ---------------------------------- ----------------------------------
  **Booking**                        A planned reservation or customer
                                     intention to use a service at a
                                     particular time.

  **Visit**                          A customer's actual physical
                                     arrival at a business location. A
                                     visit can exist without a booking.

  **ServiceSession**                 The operational delivery of a
                                     service. It tracks scheduling,
                                     execution, participants, staff,
                                     and resource usage.

  **Order**                          A commercial record of what a
                                     customer owes for goods or
                                     services.

  **Payment**                        A money-receipt transaction
                                     applied to an order. An order can
                                     have multiple partial payments.

  **CourseEnrollment**               A customer's enrollment in an
                                     entire course run or batch. It is
                                     not the same as booking one class.
  ---------------------------------------------------------------------

### 1.1 Core workflows

**Online reservation**

`Booking → Customer arrives → Visit → ServiceSession → Order → Payment → Checkout`

**Walk-in**

`Walk-in → Visit → ServiceSession → Order → Payment → Checkout`

**Training course**

`Course → CourseRun (batch) → CourseSession → ServiceSession`

A customer joins the batch through `CourseEnrollment`. Attendance is
recorded for each scheduled `CourseSession`.

### 1.2 Important modeling decisions

-   A booking is not proof that a customer arrived.
-   A visit can be created without a booking.
-   A visit can be associated with multiple service sessions.
-   A service session can be created before participants arrive.
-   A group service session can contain multiple participants.
-   A course session is a scheduled class belonging to a course run and
    is fulfilled operationally by one service session.
-   Planned resource/staff reservations and actual resource/staff
    allocations are stored separately.
-   Orders and payments are independent from booking and visit statuses.
-   Historical financial and operational records must not disappear when
    a customer, service, or staff member is deactivated.

------------------------------------------------------------------------

## 2. Database conventions

  ---------------------------------------------------------------------
  Area                               Convention
  ---------------------------------- ----------------------------------
  Primary keys                       UUID

  Model names                        PascalCase

  Field names                        camelCase

  Table names                        Prisma model names initially; use
                                     explicit `@@map` only when needed

  Timestamps                         `createdAt`, `updatedAt` on
                                     mutable records

  Event timestamps                   Store instants in UTC using
                                     PostgreSQL `TIMESTAMPTZ(3)`
                                     (`@db.Timestamptz(3)` in Prisma)

  Date-only values                   PostgreSQL `DATE` for course
                                     dates, holidays, and other
                                     calendar dates

  Local recurring times              PostgreSQL `TIME` plus weekday and
                                     the location's IANA timezone

  Money                              `Decimal`, never floating-point

  Currency                           ISO 4217 code, such as `BDT` or
                                     `USD`

  Tenant ownership                   Every tenant-owned record includes
                                     `tenantId`

  Soft deletion                      Use selectively; prefer `isActive`
                                     or lifecycle statuses for
                                     operational records

  Controlled states                  Prisma enums or normalized lookup
                                     tables
  ---------------------------------------------------------------------

### 2.1 Time-zone handling

-   Store actual event instants in UTC.
-   Store an IANA timezone on each `Location`, such as `Asia/Dhaka`.
-   Interpret recurring business hours in the location's timezone.
-   Do not store recurring opening hours as UTC timestamps.
-   Use date-only columns for values that represent calendar dates
    rather than instants.

### 2.2 Money handling

-   Use `Decimal(12,2)` as a starting point for monetary values; adjust
    precision if the product's pricing requirements demand it.
-   Store currency explicitly on financial records and price
    definitions.
-   Never use JavaScript floating-point arithmetic as the source of
    truth for money calculations.
-   Snapshot the agreed price on bookings, orders, and order items so
    later price changes do not rewrite history.

### 2.3 Tenant ownership and referential integrity

-   A tenant represents one business workspace.
-   A tenant can own multiple locations.
-   A user can be a member of multiple tenants.
-   A customer record is tenant-specific. The same person can be
    represented by separate customer records in different businesses.
-   Do not trust a `tenantId` supplied by the browser. Resolve tenant
    context from the authenticated user's verified membership.
-   Enforce tenant ownership in service-layer authorization and database
    relationships.
-   Where practical, use composite foreign keys such as
    `(tenantId, customerId)` referencing `(tenantId, id)` to prevent
    cross-tenant references.
-   Add tenant-scoped unique constraints, for example
    `@@unique([tenantId, slug])`.
-   Consider PostgreSQL Row-Level Security later as an additional
    defense, not as a replacement for application authorization.

------------------------------------------------------------------------

## 3. Module overview

  -----------------------------------------------------------------------
  Module                Main models                 Priority
  --------------------- --------------------------- ---------------------
  Tenant and identity   Tenant, User,               MVP
                        TenantMembership,           
                        BusinessProfile             

  Locations             Location                    MVP

  Customers             Customer, CustomerNote,     Core
                        CustomerTag,                
                        CustomerTagAssignment       

  Services and          ServiceCategory, Service,   MVP
  resources             Resource, ServiceLocation,  
                        ServiceResource             

  Staff                 StaffProfile,               Core
                        StaffLocation,              
                        StaffService, StaffShift,   
                        StaffAttendance             

  Availability          LocationBusinessHour,       MVP
                        StaffAvailabilityRule,      
                        ResourceAvailabilityRule,   
                        AvailabilityOverride,       
                        ResourceBlock               

  Booking               Booking, BookingResource,   MVP
                        BookingStaff                

  Daily operations      Visit, ServiceSession,      MVP
                        VisitSession,               
                        SessionParticipant,         
                        SessionResource,            
                        SessionStaff                

  Courses               Course, CourseRun,          Later phase
                        CourseSession,              
                        CourseEnrollment,           
                        Attendance                  

  Finance               Order, OrderItem, Payment,  MVP finance
                        Refund                      

  Cash management       CashRegister, CashMovement  Later phase

  Notifications         NotificationTemplate,       Later phase
                        NotificationLog             

  Platform              Plan, Subscription,         Later phase
  administration        AuditLog, Integration       
  -----------------------------------------------------------------------

------------------------------------------------------------------------

# 4. Tenant and identity

## 4.1 Tenant

Represents a business workspace using the platform.

  Field         Type           Rules / notes
  ------------- -------------- -------------------------------------------------
  `id`          UUID           Primary key
  `name`        String         Required
  `slug`        String         Required; globally unique tenant URL identifier
  `status`      TenantStatus   ACTIVE, SUSPENDED, CANCELLED
  `createdAt`   DateTime       Required
  `updatedAt`   DateTime       Required

**Constraints** - `slug` must be unique. - A tenant must retain at least
one active owner. - Suspending a tenant should block normal tenant
operations without deleting its data.

## 4.2 User

Represents a platform identity and authentication account. A user is not
inherently tied to one business.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `name`                  String                  Required

  `email`                 String                  Required; globally
                                                  unique after
                                                  normalization

  `passwordHash`          String?                 Nullable if external
                                                  authentication is
                                                  supported

  `phone`                 String?                 Optional

  `emailVerifiedAt`       DateTime?               Optional

  `isActive`              Boolean                 Defaults to true

  `createdAt`             DateTime                Required

  `updatedAt`             DateTime                Required
  -----------------------------------------------------------------------

**Notes** - Normalize email addresses before enforcing uniqueness. - Do
not store plaintext passwords. - A user may have memberships in multiple
tenants.

## 4.3 TenantMembership

Connects a platform user to a tenant and defines their tenant-level
access.

  Field         Type               Rules / notes
  ------------- ------------------ -------------------------------------
  `id`          UUID               Primary key
  `tenantId`    UUID               FK → Tenant
  `userId`      UUID               FK → User
  `role`        TenantRole         OWNER, ADMIN, MANAGER, STAFF
  `status`      MembershipStatus   INVITED, ACTIVE, SUSPENDED, REVOKED
  `joinedAt`    DateTime?          Set when membership becomes active
  `createdAt`   DateTime           Required
  `updatedAt`   DateTime           Required

**Constraints** - Unique `(tenantId, userId)`. - Index
`(userId, status)` for membership lookup. - Enforce role permissions in
the application. - Prevent removal or deactivation of the last active
owner.

## 4.4 BusinessProfile

Stores public-facing and business-level information for a tenant.

  Field             Type       Rules / notes
  ----------------- ---------- ---------------------
  `id`              UUID       Primary key
  `tenantId`        UUID       FK → Tenant; unique
  `displayName`     String     Required
  `description`     String?    Optional
  `logoUrl`         String?    Optional
  `coverImageUrl`   String?    Optional
  `email`           String?    Optional
  `phone`           String?    Optional
  `website`         String?    Optional
  `createdAt`       DateTime   Required
  `updatedAt`       DateTime   Required

**Constraint:** one business profile per tenant.

------------------------------------------------------------------------

# 5. Locations

## 5.1 Location

Represents a physical branch or operating location.

  Field             Type       Rules / notes
  ----------------- ---------- --------------------------------
  `id`              UUID       Primary key
  `tenantId`        UUID       FK → Tenant
  `name`            String     Required
  `slug`            String     Required; unique within tenant
  `addressLine1`    String?    Optional
  `addressLine2`    String?    Optional
  `city`            String?    Optional
  `stateOrRegion`   String?    Optional
  `postalCode`      String?    Optional
  `countryCode`     String     ISO 3166-1 alpha-2
  `timezone`        String     IANA timezone
  `phone`           String?    Optional
  `isActive`        Boolean    Defaults to true
  `createdAt`       DateTime   Required
  `updatedAt`       DateTime   Required

**Constraints** - Unique `(tenantId, slug)`. - A location belongs to
exactly one tenant. - Deactivating a location must not delete its
historical bookings, visits, sessions, or financial records.

------------------------------------------------------------------------

# 6. Customer management

## 6.1 Customer

A customer is a tenant-specific business contact. A customer does not
need a platform login.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `name`                  String                  Required

  `email`                 String?                 Optional

  `phone`                 String?                 Optional

  `status`                CustomerStatus          ACTIVE, INACTIVE

  `notes`                 String?                 Optional short internal
                                                  note; use CustomerNote
                                                  for history

  `createdAt`             DateTime                Required

  `updatedAt`             DateTime                Required
  -----------------------------------------------------------------------

**Constraints and notes** - Index `(tenantId, phone)` and
`(tenantId, email)` where useful. - Do not impose phone or email
uniqueness unless the business workflow requires it. - Avoid collecting
date of birth, gender, or other personal data unless a concrete business
requirement exists. - Customer data must remain tenant-isolated.

## 6.2 CustomerNote

Stores a history of internal notes about a customer.

  Field                     Type       Rules / notes
  ------------------------- ---------- -----------------------
  `id`                      UUID       Primary key
  `tenantId`                UUID       FK → Tenant
  `customerId`              UUID       FK → Customer
  `createdByMembershipId`   UUID?      FK → TenantMembership
  `content`                 String     Required
  `createdAt`               DateTime   Required
  `updatedAt`               DateTime   Required

**Notes** - Use composite tenant-aware references where practical. -
Keep notes access-controlled; do not store secrets or payment
credentials.

## 6.3 CustomerTag

  Field         Type       Rules / notes
  ------------- ---------- ------------------------
  `id`          UUID       Primary key
  `tenantId`    UUID       FK → Tenant
  `name`        String     Required
  `color`       String?    Optional display color
  `createdAt`   DateTime   Required

**Constraint:** unique `(tenantId, name)`.

## 6.4 CustomerTagAssignment

Join table assigning tags to customers.

  Field             Type       Rules / notes
  ----------------- ---------- ------------------
  `id`              UUID       Primary key
  `tenantId`        UUID       FK → Tenant
  `customerId`      UUID       FK → Customer
  `customerTagId`   UUID       FK → CustomerTag
  `createdAt`       DateTime   Required

**Constraint:** unique `(customerId, customerTagId)`.

------------------------------------------------------------------------

# 7. Services and resources

## 7.1 ServiceCategory

Groups services for easier management and discovery.

  Field           Type       Rules / notes
  --------------- ---------- ------------------
  `id`            UUID       Primary key
  `tenantId`      UUID       FK → Tenant
  `name`          String     Required
  `description`   String?    Optional
  `isActive`      Boolean    Defaults to true
  `createdAt`     DateTime   Required
  `updatedAt`     DateTime   Required

**Constraint:** unique `(tenantId, name)`.

## 7.2 Service

Represents an offering sold or delivered by the business, not an
individual occurrence of that service.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `categoryId`            UUID?                   FK → ServiceCategory

  `name`                  String                  Required

  `description`           String?                 Optional

  `bookingStrategy`       BookingStrategy         FIXED_SLOT,
                                                  FLEXIBLE_DURATION,
                                                  GROUP_SESSION

  `durationMinutes`       Int?                    Default duration where
                                                  applicable

  `basePrice`             Decimal(12,2)           Default price

  `currency`              String                  ISO 4217

  `defaultCapacity`       Int?                    Relevant to group
                                                  services

  `requiresStaff`         Boolean                 Defaults to false

  `requiresResource`      Boolean                 Defaults to false

  `isActive`              Boolean                 Defaults to true

  `createdAt`             DateTime                Required

  `updatedAt`             DateTime                Required
  -----------------------------------------------------------------------

**Booking strategy** - `FIXED_SLOT`: a fixed-duration reservation, such
as a badminton court booking. - `FLEXIBLE_DURATION`: a service with a
variable duration. - `GROUP_SESSION`: a shared scheduled service with
multiple participants.

**Notes** - Booking strategy belongs to each service, not globally to
the tenant. - `basePrice` is a default. Actual agreed prices must be
snapshotted on bookings or order items. - A service can be offered at
multiple locations. - A service may require one or more resources and/or
staff members.

## 7.3 ServiceLocation

Maps services to locations where they are offered.

  Field          Type      Rules / notes
  -------------- --------- ------------------
  `id`           UUID      Primary key
  `tenantId`     UUID      FK → Tenant
  `serviceId`    UUID      FK → Service
  `locationId`   UUID      FK → Location
  `isActive`     Boolean   Defaults to true

**Constraint:** unique `(serviceId, locationId)`.

## 7.4 Resource

Represents a bookable or operational asset: court, room, field, table,
studio, or equipment.

  Field           Type                     Rules / notes
  --------------- ------------------------ ------------------------------------
  `id`            UUID                     Primary key
  `tenantId`      UUID                     FK → Tenant
  `locationId`    UUID                     FK → Location
  `name`          String                   Required
  `type`          String or ResourceType   Controlled by product requirements
  `description`   String?                  Optional
  `status`        ResourceStatus           ACTIVE, INACTIVE, MAINTENANCE
  `isActive`      Boolean                  Defaults to true
  `createdAt`     DateTime                 Required
  `updatedAt`     DateTime                 Required

**Important:** Resource status is not the same as availability. Actual
availability is calculated from operating hours, resource rules,
maintenance blocks, bookings, and active session allocations.

## 7.5 ServiceResource

Maps services to resources they may require.

  Field          Type      Rules / notes
  -------------- --------- -----------------------------------------
  `id`           UUID      Primary key
  `tenantId`     UUID      FK → Tenant
  `serviceId`    UUID      FK → Service
  `resourceId`   UUID      FK → Resource
  `isRequired`   Boolean   Whether this resource type is mandatory

**Constraint:** unique `(serviceId, resourceId)`.

------------------------------------------------------------------------

# 8. Staff management

## 8.1 StaffProfile

Represents an employee or contractor working for a tenant. Staff can
exist without a dashboard login.

  Field                Type               Rules / notes
  -------------------- ------------------ --------------------------------------------------
  `id`                 UUID               Primary key
  `tenantId`           UUID               FK → Tenant
  `userId`             UUID?              Optional FK → User if staff needs platform login
  `displayName`        String             Required
  `email`              String?            Optional contact
  `phone`              String?            Optional contact
  `employmentStatus`   EmploymentStatus   ACTIVE, INACTIVE, TERMINATED
  `joinedAt`           DateTime?          Optional
  `createdAt`          DateTime           Required
  `updatedAt`          DateTime           Required

**Notes** - A staff member's dashboard access is controlled through
membership and permissions, not merely by the existence of a
StaffProfile. - If a staff member has a platform login, ensure the
linked user is authorized for the same tenant.

## 8.2 StaffLocation

Maps staff members to locations where they can work.

  Field          Type   Rules / notes
  -------------- ------ -------------------
  `id`           UUID   Primary key
  `tenantId`     UUID   FK → Tenant
  `staffId`      UUID   FK → StaffProfile
  `locationId`   UUID   FK → Location

**Constraint:** unique `(staffId, locationId)`.

## 8.3 StaffService

Maps staff members to services they are qualified or permitted to
deliver.

  Field         Type   Rules / notes
  ------------- ------ -------------------
  `id`          UUID   Primary key
  `tenantId`    UUID   FK → Tenant
  `staffId`     UUID   FK → StaffProfile
  `serviceId`   UUID   FK → Service

**Constraint:** unique `(staffId, serviceId)`.

## 8.4 StaffShift

Represents a planned staff shift.

  Field          Type          Rules / notes
  -------------- ------------- ---------------------------------
  `id`           UUID          Primary key
  `tenantId`     UUID          FK → Tenant
  `locationId`   UUID          FK → Location
  `staffId`      UUID          FK → StaffProfile
  `startAt`      DateTime      Planned start instant
  `endAt`        DateTime      Planned end instant
  `status`       ShiftStatus   SCHEDULED, CANCELLED, COMPLETED
  `notes`        String?       Optional
  `createdAt`    DateTime      Required
  `updatedAt`    DateTime      Required

**Constraint:** `endAt` must be later than `startAt`.

## 8.5 StaffAttendance

Stores actual staff attendance against a planned shift or an ad hoc
attendance event.

  Field            Type                    Rules / notes
  ---------------- ----------------------- -----------------------------------
  `id`             UUID                    Primary key
  `tenantId`       UUID                    FK → Tenant
  `staffId`        UUID                    FK → StaffProfile
  `staffShiftId`   UUID?                   Optional FK → StaffShift
  `checkInAt`      DateTime?               Actual check-in
  `checkOutAt`     DateTime?               Actual check-out
  `status`         StaffAttendanceStatus   PRESENT, LATE, ABSENT, LEFT_EARLY
  `notes`          String?                 Optional
  `createdAt`      DateTime                Required

**Notes:** Planned shifts and actual attendance are separate records.

------------------------------------------------------------------------

# 9. Availability and resource blocking

Availability is derived from multiple inputs. Do not use one generic
availability record with an ambiguous polymorphic target unless there is
a clear reason to do so. Separate rules make ownership and constraints
easier to understand.

## 9.1 LocationBusinessHour

Defines the normal weekly opening hours of a location.

  Field          Type      Rules / notes
  -------------- --------- --------------------------------------
  `id`           UUID      Primary key
  `tenantId`     UUID      FK → Tenant
  `locationId`   UUID      FK → Location
  `dayOfWeek`    Int       0--6 using one documented convention
  `opensAt`      Time      Local wall-clock time
  `closesAt`     Time      Local wall-clock time
  `isClosed`     Boolean   Defaults to false

**Constraints** - Unique `(locationId, dayOfWeek)` if only one opening
interval per day is supported. - If split shifts are required, allow
multiple intervals per weekday instead of enforcing that uniqueness. -
Decide explicitly whether overnight hours are supported. If not, require
`closesAt > opensAt`.

## 9.2 StaffAvailabilityRule

Defines a staff member's recurring availability.

  Field          Type      Rules / notes
  -------------- --------- ---------------------------------
  `id`           UUID      Primary key
  `tenantId`     UUID      FK → Tenant
  `staffId`      UUID      FK → StaffProfile
  `locationId`   UUID?     Optional location-specific rule
  `dayOfWeek`    Int       0--6
  `startTime`    Time      Local wall-clock time
  `endTime`      Time      Local wall-clock time
  `isActive`     Boolean   Defaults to true

## 9.3 ResourceAvailabilityRule

Defines recurring availability for a resource.

  Field          Type      Rules / notes
  -------------- --------- -----------------------
  `id`           UUID      Primary key
  `tenantId`     UUID      FK → Tenant
  `resourceId`   UUID      FK → Resource
  `dayOfWeek`    Int       0--6
  `startTime`    Time      Local wall-clock time
  `endTime`      Time      Local wall-clock time
  `isActive`     Boolean   Defaults to true

## 9.4 AvailabilityOverride

Represents an exception to normal location, staff, or resource
availability.

A simple MVP may implement separate tables such as
`LocationAvailabilityOverride`, `StaffAvailabilityOverride`, and
`ResourceAvailabilityOverride`. If a shared table is used, its target
type and target ID must be validated carefully because a normal foreign
key cannot reference several unrelated tables.

Common fields for an override:

  Field         Type                       Rules / notes
  ------------- -------------------------- --------------------------------------------
  `id`          UUID                       Primary key
  `tenantId`    UUID                       FK → Tenant
  `date`        Date                       Local calendar date at the target location
  `startTime`   Time?                      Null may represent all-day
  `endTime`     Time?                      Null may represent all-day
  `type`        AvailabilityOverrideType   CLOSED, SPECIAL_HOURS
  `reason`      String?                    Optional
  `createdAt`   DateTime                   Required

## 9.5 ResourceBlock

Blocks a resource for maintenance, private use, or another operational
reason.

  Field          Type                  Rules / notes
  -------------- --------------------- -------------------
  `id`           UUID                  Primary key
  `tenantId`     UUID                  FK → Tenant
  `resourceId`   UUID                  FK → Resource
  `startAt`      DateTime              Required
  `endAt`        DateTime              Required
  `reason`       String?               Optional
  `status`       ResourceBlockStatus   ACTIVE, CANCELLED
  `createdAt`    DateTime              Required

**Constraint:** `endAt` must be later than `startAt`.

------------------------------------------------------------------------

# 10. Booking management

## 10.1 Booking

Represents a planned reservation. It does not represent actual
attendance or service delivery.

  -----------------------------------------------------------------------
  Field                     Type                   Rules / notes
  ------------------------- ---------------------- ----------------------
  `id`                      UUID                   Primary key

  `tenantId`                UUID                   FK → Tenant

  `locationId`              UUID                   FK → Location

  `customerId`              UUID                   FK → Customer

  `serviceId`               UUID                   FK → Service

  `bookingNumber`           String                 Human-readable
                                                   tenant-scoped
                                                   identifier

  `startAt`                 DateTime               Planned start

  `endAt`                   DateTime               Planned end

  `status`                  BookingStatus          PENDING, CONFIRMED,
                                                   CANCELLED, COMPLETED,
                                                   NO_SHOW

  `source`                  BookingSource          ONLINE, STAFF, PHONE,
                                                   OTHER

  `quotedAmount`            Decimal(12,2)          Price snapshot

  `currency`                String                 ISO 4217

  `notes`                   String?                Optional

  `createdByMembershipId`   UUID?                  Optional FK →
                                                   TenantMembership

  `createdAt`               DateTime               Required

  `updatedAt`               DateTime               Required
  -----------------------------------------------------------------------

**Constraints and notes** - Unique `(tenantId, bookingNumber)`. -
`endAt` must be later than `startAt`. - The booking's customer, service,
and location must belong to the same tenant. - A booking may reserve one
or more resources and staff members. - The initial customer-facing flow
can create one primary service per booking. - A booking can be cancelled
or rescheduled without deleting its history. - `quotedAmount` is a quote
snapshot; the final amount is represented by an Order.

## 10.2 BookingResource

Stores planned resource reservations for a booking.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `bookingId`             UUID                    FK → Booking

  `resourceId`            UUID                    FK → Resource

  `startAt`               DateTime                Reserved start;
                                                  supports
                                                  resource-specific
                                                  intervals

  `endAt`                 DateTime                Reserved end
  -----------------------------------------------------------------------

**Constraint:** `endAt` must be later than `startAt`.

## 10.3 BookingStaff

Stores planned staff assignments for a booking.

  Field         Type   Rules / notes
  ------------- ------ -------------------
  `id`          UUID   Primary key
  `tenantId`    UUID   FK → Tenant
  `bookingId`   UUID   FK → Booking
  `staffId`     UUID   FK → StaffProfile

**Constraint:** unique `(bookingId, staffId)`.

------------------------------------------------------------------------

# 11. Daily operations

## 11.1 Visit

Represents an actual customer arrival at a physical location.

  -----------------------------------------------------------------------
  Field                     Type                   Rules / notes
  ------------------------- ---------------------- ----------------------
  `id`                      UUID                   Primary key

  `tenantId`                UUID                   FK → Tenant

  `locationId`              UUID                   FK → Location

  `customerId`              UUID                   FK → Customer

  `bookingId`               UUID?                  Optional FK → Booking

  `visitNumber`             String                 Human-readable
                                                   tenant-scoped
                                                   identifier

  `source`                  VisitSource            ONLINE_BOOKING,
                                                   WALK_IN, STAFF_CREATED

  `status`                  VisitStatus            CHECKED_IN,
                                                   IN_PROGRESS,
                                                   COMPLETED, CANCELLED

  `checkedInAt`             DateTime               Actual arrival time

  `checkedOutAt`            DateTime?              Actual departure time

  `notes`                   String?                Optional

  `createdByMembershipId`   UUID?                  Optional FK →
                                                   TenantMembership

  `createdAt`               DateTime               Required

  `updatedAt`               DateTime               Required
  -----------------------------------------------------------------------

**Constraints and decisions** - Unique `(tenantId, visitNumber)`. - A
visit can exist without a booking. - Initial MVP assumption: one booking
produces at most one primary visit. If that remains the rule, make
nullable `bookingId` unique. - If future workflows allow a booking to be
fulfilled across multiple visits, remove that unique constraint and
model the relationship explicitly. - The visit's customer and location
must belong to the same tenant as the visit.

## 11.2 ServiceSession

Represents the actual operational delivery of a service. It can be
scheduled in advance or created for a walk-in.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `locationId`            UUID                    FK → Location

  `serviceId`             UUID                    FK → Service

  `sessionNumber`         String                  Human-readable
                                                  tenant-scoped
                                                  identifier

  `scheduledStartAt`      DateTime?               Planned start; optional
                                                  for unscheduled
                                                  walk-ins

  `scheduledEndAt`        DateTime?               Planned end

  `actualStartAt`         DateTime?               Actual service start

  `actualEndAt`           DateTime?               Actual service end

  `status`                ServiceSessionStatus    SCHEDULED, IN_PROGRESS,
                                                  COMPLETED, CANCELLED

  `capacity`              Int?                    Optional session
                                                  capacity

  `notes`                 String?                 Optional

  `createdAt`             DateTime                Required

  `updatedAt`             DateTime                Required
  -----------------------------------------------------------------------

**Notes** - A session can exist before any customer arrives. - A session
can have multiple participants, staff members, and resources. -
Scheduled and actual times are distinct. - For an unscheduled walk-in,
scheduled times may be null while actual times are populated during
execution. - Enforce `endAt > startAt` for each non-null interval.

## 11.3 VisitSession

Join table connecting visits and service sessions.

  Field                Type       Rules / notes
  -------------------- ---------- ---------------------
  `id`                 UUID       Primary key
  `tenantId`           UUID       FK → Tenant
  `visitId`            UUID       FK → Visit
  `serviceSessionId`   UUID       FK → ServiceSession
  `createdAt`          DateTime   Required

**Constraint:** unique `(visitId, serviceSessionId)`.

**Why a join table?** A visit may include multiple service sessions, and
a group service session may involve customers arriving through different
visits.

## 11.4 SessionParticipant

Represents a customer participating in an operational service session.

  Field                Type                Rules / notes
  -------------------- ------------------- --------------------------------------
  `id`                 UUID                Primary key
  `tenantId`           UUID                FK → Tenant
  `serviceSessionId`   UUID                FK → ServiceSession
  `customerId`         UUID                FK → Customer
  `status`             ParticipantStatus   REGISTERED, PRESENT, LEFT, CANCELLED
  `joinedAt`           DateTime?           Optional
  `leftAt`             DateTime?           Optional
  `createdAt`          DateTime            Required

**Constraint:** unique `(serviceSessionId, customerId)` unless repeat
participation by the same customer in one session is a supported
requirement.

## 11.5 SessionResource

Stores actual resource allocations for a service session.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `serviceSessionId`      UUID                    FK → ServiceSession

  `resourceId`            UUID                    FK → Resource

  `allocatedStartAt`      DateTime                Actual allocation start

  `allocatedEndAt`        DateTime                Actual allocation end;
                                                  may be set when
                                                  released

  `createdAt`             DateTime                Required
  -----------------------------------------------------------------------

**Notes** - This is actual allocation, not the planned reservation
stored in BookingResource. - If `allocatedEndAt` is nullable for an
active allocation, enforce valid interval logic when it is populated.

## 11.6 SessionStaff

Stores actual staff assignments to a service session.

  Field                Type        Rules / notes
  -------------------- ----------- ---------------------
  `id`                 UUID        Primary key
  `tenantId`           UUID        FK → Tenant
  `serviceSessionId`   UUID        FK → ServiceSession
  `staffId`            UUID        FK → StaffProfile
  `assignedAt`         DateTime    Required
  `releasedAt`         DateTime?   Optional

**Constraint:** unique `(serviceSessionId, staffId)` if one assignment
per staff member per session is sufficient.

------------------------------------------------------------------------

# 12. Course and enrollment management

This module supports training centers and coaching institutes. A
reusable course definition is separate from a specific batch/run.

## 12.1 Course

Represents a reusable course offering.

  Field                   Type            Rules / notes
  ----------------------- --------------- ----------------------
  `id`                    UUID            Primary key
  `tenantId`              UUID            FK → Tenant
  `name`                  String          Required
  `description`           String?         Optional
  `defaultDurationDays`   Int?            Optional
  `basePrice`             Decimal(12,2)   Default course price
  `currency`              String          ISO 4217
  `isActive`              Boolean         Defaults to true
  `createdAt`             DateTime        Required
  `updatedAt`             DateTime        Required

## 12.2 CourseRun

Represents a specific delivery of a course, usually called a batch or
cohort.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `courseId`              UUID                    FK → Course

  `locationId`            UUID                    FK → Location

  `name`                  String                  Batch name

  `startDate`             Date                    Calendar date

  `endDate`               Date                    Calendar date

  `capacity`              Int?                    Maximum enrollment

  `enrollmentDeadline`    DateTime?               Optional

  `status`                CourseRunStatus         DRAFT, ENROLLING,
                                                  IN_PROGRESS, COMPLETED,
                                                  CANCELLED

  `createdAt`             DateTime                Required

  `updatedAt`             DateTime                Required
  -----------------------------------------------------------------------

**Constraints** - `endDate` must not be earlier than `startDate`. -
Enrollment capacity must be enforced transactionally. - Course and
location must belong to the same tenant.

## 12.3 CourseSession

Represents one scheduled class within a course run.

  Field                Type                  Rules / notes
  -------------------- --------------------- ---------------------------------
  `id`                 UUID                  Primary key
  `tenantId`           UUID                  FK → Tenant
  `courseRunId`        UUID                  FK → CourseRun
  `serviceSessionId`   UUID                  FK → ServiceSession; unique
  `sessionNumber`      Int                   Sequence within course run
  `startAt`            DateTime              Scheduled class start
  `endAt`              DateTime              Scheduled class end
  `topic`              String?               Optional
  `status`             CourseSessionStatus   SCHEDULED, COMPLETED, CANCELLED
  `createdAt`          DateTime              Required
  `updatedAt`          DateTime              Required

**Important relationship:** Each CourseSession is fulfilled by one
ServiceSession. This allows course classes to reuse the operational
model for staff, resources, participants, and execution.

## 12.4 CourseEnrollment

Represents a customer's enrollment in a complete course run.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `courseRunId`           UUID                    FK → CourseRun

  `customerId`            UUID                    FK → Customer

  `enrollmentNumber`      String                  Human-readable
                                                  tenant-scoped
                                                  identifier

  `enrolledAt`            DateTime                Required

  `agreedFee`             Decimal(12,2)           Price agreed at
                                                  enrollment

  `currency`              String                  ISO 4217

  `status`                EnrollmentStatus        PENDING, ACTIVE,
                                                  COMPLETED, WITHDRAWN,
                                                  CANCELLED

  `createdAt`             DateTime                Required

  `updatedAt`             DateTime                Required
  -----------------------------------------------------------------------

**Constraints** - Unique `(courseRunId, customerId)` unless
re-enrollment in the same run is explicitly supported. - Unique
`(tenantId, enrollmentNumber)`. - Enrollment capacity must be checked
safely under concurrent requests.

## 12.5 Attendance

Records attendance for one enrolled student at one course session.

  Field                    Type               Rules / notes
  ------------------------ ------------------ --------------------------------
  `id`                     UUID               Primary key
  `tenantId`               UUID               FK → Tenant
  `courseSessionId`        UUID               FK → CourseSession
  `enrollmentId`           UUID               FK → CourseEnrollment
  `status`                 AttendanceStatus   PRESENT, ABSENT, LATE, EXCUSED
  `markedByMembershipId`   UUID?              Optional FK → TenantMembership
  `markedAt`               DateTime           Required
  `notes`                  String?            Optional

**Constraints** - Unique `(courseSessionId, enrollmentId)`. - Validate
that the enrollment belongs to the same course run as the course
session. - Attendance is the authoritative course-attendance record. If
the same class also creates SessionParticipant records, define a single
synchronization path so the two records cannot contradict each other.

------------------------------------------------------------------------

# 13. Orders and payments

Financial records must be independent from booking and visit lifecycle
statuses. An order may have multiple partial payments, and a payment may
have one or more refunds.

## 13.1 Order

Represents a customer's commercial obligation or sale.

  Field              Type            Rules / notes
  ------------------ --------------- -----------------------------------------
  `id`               UUID            Primary key
  `tenantId`         UUID            FK → Tenant
  `locationId`       UUID            FK → Location
  `customerId`       UUID?           Optional for anonymous sales
  `visitId`          UUID?           Optional FK → Visit
  `orderNumber`      String          Human-readable tenant-scoped identifier
  `subtotal`         Decimal(12,2)   Required
  `discountAmount`   Decimal(12,2)   Defaults to zero
  `taxAmount`        Decimal(12,2)   Defaults to zero
  `totalAmount`      Decimal(12,2)   Required
  `currency`         String          ISO 4217
  `status`           OrderStatus     DRAFT, OPEN, COMPLETED, CANCELLED
  `createdAt`        DateTime        Required
  `updatedAt`        DateTime        Required

**Constraints and notes** - Unique `(tenantId, orderNumber)`. -
`totalAmount` must be validated against line items, discounts, and
taxes. - An order can have multiple order items and multiple payments. -
A customer and visit, when present, must belong to the same tenant. - Do
not delete completed financial history when a customer or service is
deactivated.

## 13.2 OrderItem

Stores a snapshot of each purchased service or other line item.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `orderId`               UUID                    FK → Order

  `serviceId`             UUID?                   Optional reference to
                                                  source Service

  `description`           String                  Snapshot description

  `quantity`              Decimal(10,2)           Required; supports
                                                  fractional quantities
                                                  if needed

  `unitPrice`             Decimal(12,2)           Snapshot unit price

  `discountAmount`        Decimal(12,2)           Defaults to zero

  `taxAmount`             Decimal(12,2)           Defaults to zero

  `lineTotal`             Decimal(12,2)           Snapshot calculated
                                                  line total

  `createdAt`             DateTime                Required
  -----------------------------------------------------------------------

**Notes** - The description and unit price are snapshots; do not
calculate historical invoices from the current Service record. -
`serviceId` may be null if the source service is later removed or the
item is not a service. - Keep historical references nullable or
restricted rather than cascading financial data away.

## 13.3 Payment

Represents one payment transaction or receipt against an order.

  ----------------------------------------------------------------------
  Field                      Type                  Rules / notes
  -------------------------- --------------------- ---------------------
  `id`                       UUID                  Primary key

  `tenantId`                 UUID                  FK → Tenant

  `orderId`                  UUID                  FK → Order

  `paymentNumber`            String                Human-readable
                                                   tenant-scoped
                                                   identifier

  `amount`                   Decimal(12,2)         Transaction amount

  `currency`                 String                ISO 4217

  `method`                   PaymentMethod         CASH, CARD,
                                                   BANK_TRANSFER,
                                                   MOBILE_BANKING,
                                                   ONLINE_GATEWAY, OTHER

  `status`                   PaymentStatus         PENDING, PROCESSING,
                                                   SUCCEEDED, FAILED,
                                                   CANCELLED

  `provider`                 String?               Gateway/provider name

  `providerReference`        String?               Provider transaction
                                                   identifier

  `idempotencyKey`           String?               Prevents duplicate
                                                   processing

  `receivedByMembershipId`   UUID?                 Optional FK →
                                                   TenantMembership

  `paidAt`                   DateTime?             Successful receipt
                                                   time

  `createdAt`                DateTime              Required

  `updatedAt`                DateTime              Required
  ----------------------------------------------------------------------

**Important status distinction** - `PaymentStatus` describes the
individual payment transaction. - Do not use `PARTIALLY_PAID` as a
payment status. Partial payment is an order-level aggregate condition
calculated from successful payments. - A payment's successful status
must be based on trusted confirmation, such as a verified provider
webhook or a reconciled cash receipt. - Enforce idempotency for
payment-provider callbacks and retry handling. - Unique provider
references should be scoped appropriately, usually by provider and
tenant or provider account.

## 13.4 Refund

Represents a full or partial refund against a successful payment.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `paymentId`             UUID                    FK → Payment

  `amount`                Decimal(12,2)           Refund amount

  `status`                RefundStatus            PENDING, PROCESSING,
                                                  SUCCEEDED, FAILED,
                                                  CANCELLED

  `reason`                String?                 Optional

  `providerReference`     String?                 Optional gateway refund
                                                  reference

  `processedAt`           DateTime?               Successful processing
                                                  time

  `createdAt`             DateTime                Required

  `updatedAt`             DateTime                Required
  -----------------------------------------------------------------------

**Rules** - Multiple partial refunds may exist for one payment. - The
total of successful refunds must never exceed the successfully captured
payment amount. - Enforce this rule transactionally; a simple
application-side check is insufficient under concurrency. - Do not
change the original payment amount to represent a refund. Keep the
refund as a separate financial event.

### 13.5 Order payment state

The order's outstanding balance can be derived as:

`Outstanding = Order.totalAmount - SuccessfulPayments + SuccessfulRefunds`

The exact accounting treatment of refunds and credits may require a more
formal ledger later. For the MVP, do not confuse the status of one
payment with the aggregate settlement state of an order.

------------------------------------------------------------------------

# 14. Cash management

These tables are useful when a physical location needs cashier shifts
and cash reconciliation. They can be implemented after the core booking,
operations, and payment workflows.

## 14.1 CashRegister

Represents a cashier's register session or shift at a location.

  Field                    Type                 Rules / notes
  ------------------------ -------------------- ---------------------------------
  `id`                     UUID                 Primary key
  `tenantId`               UUID                 FK → Tenant
  `locationId`             UUID                 FK → Location
  `openedByMembershipId`   UUID                 FK → TenantMembership
  `closedByMembershipId`   UUID?                Optional FK → TenantMembership
  `openingBalance`         Decimal(12,2)        Required
  `closingBalance`         Decimal(12,2)?       Counted closing cash
  `expectedBalance`        Decimal(12,2)?       Calculated reconciliation value
  `status`                 CashRegisterStatus   OPEN, CLOSED
  `openedAt`               DateTime             Required
  `closedAt`               DateTime?            Optional

## 14.2 CashMovement

Records cash entering or leaving a register.

  Field                     Type               Rules / notes
  ------------------------- ------------------ -----------------------
  `id`                      UUID               Primary key
  `tenantId`                UUID               FK → Tenant
  `cashRegisterId`          UUID               FK → CashRegister
  `type`                    CashMovementType   CASH_IN, CASH_OUT
  `amount`                  Decimal(12,2)      Positive amount
  `reason`                  String?            Optional
  `paymentId`               UUID?              Optional FK → Payment
  `refundId`                UUID?              Optional FK → Refund
  `createdByMembershipId`   UUID               FK → TenantMembership
  `createdAt`               DateTime           Required

**Rules** - Calculate expected cash from opening balance and cash
movements. - Do not allow users to edit a calculated balance directly. -
Link cash receipts and cash refunds to their source transactions when
applicable. - Prevent one payment or refund from being counted twice in
cash movements.

------------------------------------------------------------------------

# 15. Notifications

## 15.1 NotificationTemplate

Stores reusable notification templates.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID?                   Null for platform-wide
                                                  templates; otherwise FK
                                                  → Tenant

  `name`                  String                  Required

  `channel`               NotificationChannel     EMAIL, SMS, WHATSAPP,
                                                  IN_APP

  `subject`               String?                 Optional

  `body`                  String                  Required

  `isActive`              Boolean                 Defaults to true

  `createdAt`             DateTime                Required

  `updatedAt`             DateTime                Required
  -----------------------------------------------------------------------

## 15.2 NotificationLog

Tracks individual notification delivery attempts.

  Field                 Type                  Rules / notes
  --------------------- --------------------- -------------------------------------------
  `id`                  UUID                  Primary key
  `tenantId`            UUID?                 Tenant context, if applicable
  `templateId`          UUID?                 Optional FK → NotificationTemplate
  `channel`             NotificationChannel   Required
  `recipient`           String                Email address, phone, or user destination
  `status`              NotificationStatus    QUEUED, SENT, FAILED, DELIVERED
  `providerReference`   String?               Provider message identifier
  `idempotencyKey`      String?               Prevent duplicate sends
  `attemptCount`        Int                   Defaults to zero
  `sentAt`              DateTime?             Optional
  `deliveredAt`         DateTime?             Optional
  `lastError`           String?               Sanitized error summary
  `createdAt`           DateTime              Required

**Notes** - Avoid storing unnecessary sensitive message content. - Do
not log access tokens, provider secrets, or full payment credentials. -
Retry policies should be bounded and idempotent.

------------------------------------------------------------------------

# 16. Platform administration and integrations

These models are not required to launch the core operational MVP, but
they support the SaaS platform as it grows.

## 16.1 Plan

Represents a platform-level subscription plan.

  Field               Type              Rules / notes
  ------------------- ----------------- --------------------------
  `id`                UUID              Primary key
  `name`              String            Required
  `code`              String            Unique plan code
  `description`       String?           Optional
  `price`             Decimal(12,2)     Plan price
  `currency`          String            ISO 4217
  `billingInterval`   BillingInterval   MONTHLY, YEARLY
  `limits`            JSON              Feature and usage limits
  `isActive`          Boolean           Defaults to true
  `createdAt`         DateTime          Required
  `updatedAt`         DateTime          Required

## 16.2 Subscription

Represents a tenant's subscription to a platform plan.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `planId`                UUID                    FK → Plan

  `status`                SubscriptionStatus      TRIALING, ACTIVE,
                                                  PAST_DUE, CANCELLED,
                                                  EXPIRED

  `startsAt`              DateTime                Required

  `currentPeriodStart`    DateTime                Required

  `currentPeriodEnd`      DateTime                Required

  `cancelledAt`           DateTime?               Optional

  `createdAt`             DateTime                Required

  `updatedAt`             DateTime                Required
  -----------------------------------------------------------------------

## 16.3 AuditLog

Records important actions for accountability and troubleshooting.

  Field                 Type       Rules / notes
  --------------------- ---------- ------------------------------------------------
  `id`                  UUID       Primary key
  `tenantId`            UUID?      Tenant context; null for platform-level events
  `actorUserId`         UUID?      Optional FK → User
  `actorMembershipId`   UUID?      Optional FK → TenantMembership
  `action`              String     Controlled action name
  `entityType`          String     Model/entity name
  `entityId`            String     Entity identifier
  `metadata`            JSON?      Minimal structured context
  `ipAddress`           String?    Optional, subject to privacy policy
  `occurredAt`          DateTime   Required

**Rules** - Audit records should be append-only for normal application
users. - Do not store passwords, tokens, payment credentials, or
unnecessary personal data in metadata.

## 16.4 Integration

Stores configuration metadata for external integrations.

  -----------------------------------------------------------------------
  Field                   Type                    Rules / notes
  ----------------------- ----------------------- -----------------------
  `id`                    UUID                    Primary key

  `tenantId`              UUID                    FK → Tenant

  `provider`              String                  Integration provider

  `status`                IntegrationStatus       ACTIVE, DISABLED, ERROR

  `configuration`         JSON?                   Non-secret
                                                  configuration only

  `secretReference`       String?                 Reference to a secure
                                                  secret store; not the
                                                  secret itself

  `createdAt`             DateTime                Required

  `updatedAt`             DateTime                Required
  -----------------------------------------------------------------------

**Constraint:** unique `(tenantId, provider)` if only one connection per
provider is allowed.

------------------------------------------------------------------------

# 17. Enums

The following are proposed controlled values. Adjust only when a
concrete workflow requires it.

``` prisma
enum TenantStatus {
  ACTIVE
  SUSPENDED
  CANCELLED
}

enum TenantRole {
  OWNER
  ADMIN
  MANAGER
  STAFF
}

enum MembershipStatus {
  INVITED
  ACTIVE
  SUSPENDED
  REVOKED
}

enum CustomerStatus {
  ACTIVE
  INACTIVE
}

enum BookingStrategy {
  FIXED_SLOT
  FLEXIBLE_DURATION
  GROUP_SESSION
}

enum ResourceStatus {
  ACTIVE
  INACTIVE
  MAINTENANCE
}

enum EmploymentStatus {
  ACTIVE
  INACTIVE
  TERMINATED
}

enum ShiftStatus {
  SCHEDULED
  CANCELLED
  COMPLETED
}

enum StaffAttendanceStatus {
  PRESENT
  LATE
  ABSENT
  LEFT_EARLY
}

enum AvailabilityOverrideType {
  CLOSED
  SPECIAL_HOURS
}

enum ResourceBlockStatus {
  ACTIVE
  CANCELLED
}

enum BookingStatus {
  PENDING
  CONFIRMED
  CANCELLED
  COMPLETED
  NO_SHOW
}

enum BookingSource {
  ONLINE
  STAFF
  PHONE
  OTHER
}

enum VisitSource {
  ONLINE_BOOKING
  WALK_IN
  STAFF_CREATED
}

enum VisitStatus {
  CHECKED_IN
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum ServiceSessionStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum ParticipantStatus {
  REGISTERED
  PRESENT
  LEFT
  CANCELLED
}

enum CourseRunStatus {
  DRAFT
  ENROLLING
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum CourseSessionStatus {
  SCHEDULED
  COMPLETED
  CANCELLED
}

enum EnrollmentStatus {
  PENDING
  ACTIVE
  COMPLETED
  WITHDRAWN
  CANCELLED
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  EXCUSED
}

enum OrderStatus {
  DRAFT
  OPEN
  COMPLETED
  CANCELLED
}

enum PaymentMethod {
  CASH
  CARD
  BANK_TRANSFER
  MOBILE_BANKING
  ONLINE_GATEWAY
  OTHER
}

enum PaymentStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELLED
}

enum RefundStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELLED
}

enum CashRegisterStatus {
  OPEN
  CLOSED
}

enum CashMovementType {
  CASH_IN
  CASH_OUT
}

enum NotificationChannel {
  EMAIL
  SMS
  WHATSAPP
  IN_APP
}

enum NotificationStatus {
  QUEUED
  SENT
  FAILED
  DELIVERED
}

enum BillingInterval {
  MONTHLY
  YEARLY
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELLED
  EXPIRED
}

enum IntegrationStatus {
  ACTIVE
  DISABLED
  ERROR
}
```

------------------------------------------------------------------------

# 18. Relationship summary

  ----------------------------------------------------------------------
  Parent                 Relationship           Child
  ---------------------- ---------------------- ------------------------
  Tenant                 1 → many               TenantMembership

  User                   1 → many               TenantMembership

  Tenant                 1 → 1                  BusinessProfile

  Tenant                 1 → many               Location

  Tenant                 1 → many               Customer

  Customer               1 → many               CustomerNote

  Customer               many ↔ many            CustomerTag (through
                                                CustomerTagAssignment)

  Tenant                 1 → many               Service

  Service                many ↔ many            Location (through
                                                ServiceLocation)

  Service                many ↔ many            Resource (through
                                                ServiceResource)

  Tenant                 1 → many               StaffProfile

  StaffProfile           many ↔ many            Location (through
                                                StaffLocation)

  StaffProfile           many ↔ many            Service (through
                                                StaffService)

  Customer               1 → many               Booking

  Booking                1 → many               BookingResource

  Booking                1 → many               BookingStaff

  Booking                0..1 → 1               Visit (initial MVP
                                                assumption: at most one
                                                visit per booking)

  Visit                  many ↔ many            ServiceSession (through
                                                VisitSession)

  ServiceSession         1 → many               SessionParticipant

  ServiceSession         1 → many               SessionResource

  ServiceSession         1 → many               SessionStaff

  Course                 1 → many               CourseRun

  CourseRun              1 → many               CourseSession

  CourseRun              1 → many               CourseEnrollment

  CourseSession          1 → 1                  ServiceSession

  CourseEnrollment       1 → many               Attendance

  Order                  1 → many               OrderItem

  Order                  1 → many               Payment

  Payment                1 → many               Refund

  CashRegister           1 → many               CashMovement

  Tenant                 1 → many               Subscription
  ----------------------------------------------------------------------

------------------------------------------------------------------------

# 19. Critical database constraints and transaction rules

These are not optional frontend validations. They must be enforced by
the backend and, where possible, the database.

## 19.1 Tenant isolation

-   Every tenant-owned row must have a valid tenant.
-   Every relation between tenant-owned records must verify that both
    records belong to the same tenant.
-   Prefer composite unique keys and composite foreign keys for
    tenant-scoped references.
-   Resolve the tenant from verified membership context.
-   Never authorize access solely because the request includes a tenant
    ID.

## 19.2 Preventing booking/resource overlaps

A unique constraint on `(resourceId, startAt)` does not prevent
overlapping reservations.

For PostgreSQL, consider an exclusion constraint using a timestamp range
and resource identifier. For example, a custom SQL migration can use a
GiST exclusion constraint over `resourceId` and a half-open time range
(`[startAt, endAt)`) for active reservations. The exact predicate must
exclude cancelled bookings and account for the desired booking statuses.

Apply equivalent conflict protection to actual `SessionResource`
allocations. Prisma may not model every exclusion constraint directly,
so use a reviewed SQL migration.

Also validate: - The resource belongs to the booking's tenant and
location. - The service is offered at the selected location. - The
resource is compatible with the service. - The resource is available
during the entire requested interval. - Maintenance blocks and existing
session allocations are respected.

## 19.3 Group-session and course capacity

-   Enforce capacity inside a database transaction.
-   Protect against two concurrent requests both taking the last
    available seat.
-   Use row locking or another concurrency-safe strategy when enrolling
    participants.
-   Define whether cancelled participants release capacity and whether
    waitlists are supported.

## 19.4 Financial integrity

-   Use transactions when creating orders and their order items.
-   Use idempotency keys for payment initiation and provider callbacks.
-   Verify gateway webhooks before marking payments successful.
-   Enforce that successful refunds do not exceed captured payment
    amounts.
-   Keep immutable snapshots of prices and descriptions.
-   Do not delete completed orders, payments, or refunds through
    ordinary tenant CRUD operations.

## 19.5 Lifecycle and deletion policy

-   Prefer deactivation (`isActive = false`) for services, staff,
    resources, and locations that have historical references.
-   Use explicit cancellation statuses for bookings, sessions,
    enrollments, and subscriptions.
-   Use `RESTRICT` or carefully chosen `SET NULL` behavior for
    historical relationships.
-   Avoid cascading deletion from Tenant, Customer, Service, or
    StaffProfile into financial and operational history.
-   Tenant deletion should be a controlled platform-level retention and
    compliance workflow, not a normal cascading delete.

------------------------------------------------------------------------

# 20. Indexing recommendations

Add indexes based on real query patterns and validate them with
`EXPLAIN ANALYZE`.

Suggested starting indexes:

  -------------------------------------------------------------------------
  Model                       Index
  --------------------------- ---------------------------------------------
  TenantMembership            `(userId, status)`, unique
                              `(tenantId, userId)`

  Location                    unique `(tenantId, slug)`

  Customer                    `(tenantId, name)`, `(tenantId, phone)`,
                              `(tenantId, email)`

  Service                     `(tenantId, isActive)`,
                              `(tenantId, categoryId)`

  Resource                    `(tenantId, locationId, status)`

  StaffProfile                `(tenantId, employmentStatus)`

  Booking                     `(tenantId, locationId, startAt)`,
                              `(tenantId, customerId, createdAt)`,
                              `(tenantId, status, startAt)`

  BookingResource             `(resourceId, startAt, endAt)`

  Visit                       `(tenantId, locationId, checkedInAt)`,
                              `(tenantId, customerId, createdAt)`

  ServiceSession              `(tenantId, locationId, scheduledStartAt)`,
                              `(tenantId, status)`

  SessionParticipant          unique `(serviceSessionId, customerId)`,
                              `(tenantId, customerId)`

  CourseRun                   `(tenantId, locationId, status, startDate)`

  CourseEnrollment            unique `(courseRunId, customerId)`,
                              `(tenantId, customerId)`

  Attendance                  unique `(courseSessionId, enrollmentId)`

  Order                       unique `(tenantId, orderNumber)`,
                              `(tenantId, locationId, createdAt)`

  Payment                     `(tenantId, orderId, status)`,
                              provider-reference lookup index

  Refund                      `(tenantId, paymentId, status)`

  AuditLog                    `(tenantId, occurredAt)`,
                              `(entityType, entityId)`
  -------------------------------------------------------------------------

Do not add every possible index preemptively. Measure query patterns,
write overhead, and query plans.

------------------------------------------------------------------------

# 21. Recommended implementation phases

## Phase 1 --- Foundation

Implement: - Tenant - User - TenantMembership - BusinessProfile -
Location

Deliverable: tenant creation, authentication, membership, and location
management.

## Phase 2 --- Business setup

Implement: - Customer - CustomerNote - ServiceCategory - Service -
ServiceLocation - Resource - ServiceResource - StaffProfile -
StaffLocation - StaffService

Deliverable: business can configure customers, services, resources, and
staff.

## Phase 3 --- Scheduling and booking

Implement: - LocationBusinessHour - StaffAvailabilityRule -
ResourceAvailabilityRule - Availability overrides - ResourceBlock -
Booking - BookingResource - BookingStaff

Deliverable: availability search, booking creation, rescheduling,
cancellation, and conflict protection.

## Phase 4 --- Daily operations

Implement: - Visit - ServiceSession - VisitSession -
SessionParticipant - SessionResource - SessionStaff

Deliverable: walk-in check-in, booking arrival, service execution,
resource allocation, and checkout workflow.

## Phase 5 --- Finance

Implement: - Order - OrderItem - Payment - Refund

Deliverable: order creation, partial payments, payment reconciliation,
and refunds.

## Phase 6 --- Training-center workflows

Implement: - Course - CourseRun - CourseSession - CourseEnrollment -
Attendance

Deliverable: course batches, enrollment, scheduled classes, and
attendance.

## Phase 7 --- Operational extensions

Implement as needed: - StaffShift - StaffAttendance - CashRegister -
CashMovement - NotificationTemplate - NotificationLog - AuditLog -
Integration - Plan - Subscription

------------------------------------------------------------------------

# 22. Open decisions before writing the Prisma schema

The logical design is a strong starting point, but resolve these
decisions before finalizing migrations:

1.  **Booking-to-visit cardinality:** The MVP assumes at most one
    primary visit per booking. Confirm whether split or repeat visits
    against one booking are ever needed.
2.  **Business hours:** Decide whether a location can have multiple
    opening intervals on the same weekday and whether overnight opening
    hours are supported.
3.  **Resource types:** Decide whether resource types are
    tenant-configurable strings or platform-managed enums.
4.  **Flexible-duration pricing:** Decide whether price is per minute,
    per hour, per block, or manually quoted.
5.  **Group capacity:** Decide whether capacity is defined by the
    service, each service session, or both (with the session value
    overriding the default).
6.  **Course fees:** Decide whether enrollment fees are paid in full or
    can use installments/payment schedules.
7.  **Tax and discounts:** Decide whether tax and discounts apply at
    order level, item level, or both, and define rounding rules.
8.  **Payment methods:** Confirm the local payment methods and gateway
    providers required for the first release.
9.  **Customer identity:** Decide whether a customer can be created with
    only a name, or whether at least one contact method is required.
10. **Staff login:** Decide which staff roles require platform accounts
    and which can be managed as staff records only.

Do not add complex abstractions until one of these decisions requires
them.

------------------------------------------------------------------------

## 23. Final modeling checklist

Before implementing the Prisma models, verify:

-   [ ] Every tenant-owned model includes `tenantId`.
-   [ ] Tenant-scoped unique constraints are defined.
-   [ ] Cross-tenant references are prevented.
-   [ ] User identity is separate from tenant membership and staff
    profile.
-   [ ] Customer records are tenant-specific and do not require login
    accounts.
-   [ ] Booking, Visit, ServiceSession, Order, and Payment remain
    separate concepts.
-   [ ] Walk-ins can enter the workflow without a Booking.
-   [ ] Group sessions can support multiple participants.
-   [ ] Course enrollment is separate from individual class attendance.
-   [ ] Planned resource/staff reservations are separate from actual
    allocations.
-   [ ] Resource conflicts are protected against concurrent writes.
-   [ ] Capacity checks are concurrency-safe.
-   [ ] Money uses Decimal and explicit currency.
-   [ ] Payment and refund flows are idempotent and transaction-safe.
-   [ ] Historical financial and operational records are preserved.
-   [ ] Time-zone and recurring-hours rules are documented.
-   [ ] Indexes reflect actual query patterns.

**Implementation note:** This document defines the logical data model.
Before applying migrations, translate the models into Prisma syntax, add
explicit relation names where multiple relations connect the same
models, define deletion behavior, and write custom PostgreSQL migrations
for constraints Prisma cannot represent directly (especially range
exclusion constraints).

------------------------------------------------------------------------

# 24. Prisma ORM schema

This section provides a concrete Prisma schema for the core operational
product. It covers tenant identity, locations, customers, services,
resources, staff, availability, bookings, daily operations, course
enrollment, orders, payments, and refunds.

The following models are intentionally left for a later implementation
phase: `StaffShift`, `StaffAttendance`, cash register/movement,
notification templates/logs, platform plans/subscriptions, audit logs,
and external integrations. Their logical definitions remain in the
earlier sections.

## 24.1 Setup

Create `prisma/schema.prisma` and configure the PostgreSQL connection
through `DATABASE_URL`.

``` prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

The schema below uses PostgreSQL UUIDs, `TIMESTAMPTZ(3)` for instants,
`DATE` for calendar dates, `TIME(0)` for recurring local-time rules, and
`DECIMAL` for money.

## 24.2 Complete core Prisma schema

``` prisma
enum TenantStatus {
  ACTIVE
  SUSPENDED
  CANCELLED
}

enum TenantRole {
  OWNER
  ADMIN
  MANAGER
  STAFF
}

enum MembershipStatus {
  INVITED
  ACTIVE
  SUSPENDED
  REVOKED
}

enum CustomerStatus {
  ACTIVE
  INACTIVE
}

enum BookingStrategy {
  FIXED_SLOT
  FLEXIBLE_DURATION
  GROUP_SESSION
}

enum ResourceStatus {
  ACTIVE
  INACTIVE
  MAINTENANCE
}

enum EmploymentStatus {
  ACTIVE
  INACTIVE
  TERMINATED
}

enum AvailabilityOverrideType {
  CLOSED
  SPECIAL_HOURS
}

enum ResourceBlockStatus {
  ACTIVE
  CANCELLED
}

enum BookingStatus {
  PENDING
  CONFIRMED
  CANCELLED
  COMPLETED
  NO_SHOW
}

enum BookingSource {
  ONLINE
  STAFF
  PHONE
  OTHER
}

enum VisitSource {
  ONLINE_BOOKING
  WALK_IN
  STAFF_CREATED
}

enum VisitStatus {
  CHECKED_IN
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum ServiceSessionStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum ParticipantStatus {
  REGISTERED
  PRESENT
  LEFT
  CANCELLED
}

enum CourseRunStatus {
  DRAFT
  ENROLLING
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum CourseSessionStatus {
  SCHEDULED
  COMPLETED
  CANCELLED
}

enum EnrollmentStatus {
  PENDING
  ACTIVE
  COMPLETED
  WITHDRAWN
  CANCELLED
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  EXCUSED
}

enum OrderStatus {
  DRAFT
  OPEN
  COMPLETED
  CANCELLED
}

enum PaymentMethod {
  CASH
  CARD
  BANK_TRANSFER
  MOBILE_BANKING
  ONLINE_GATEWAY
  OTHER
}

enum PaymentStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELLED
}

enum RefundStatus {
  PENDING
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELLED
}

model Tenant {
  id        String       @id @default(uuid()) @db.Uuid
  name      String
  slug      String       @unique
  status    TenantStatus @default(ACTIVE)
  createdAt DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt DateTime     @updatedAt @db.Timestamptz(3)

  memberships             TenantMembership[]
  businessProfile         BusinessProfile?
  locations               Location[]
  customers               Customer[]
  customerNotes           CustomerNote[]
  customerTags            CustomerTag[]
  serviceCategories       ServiceCategory[]
  services                Service[]
  serviceLocations        ServiceLocation[]
  resources               Resource[]
  serviceResources        ServiceResource[]
  staffProfiles           StaffProfile[]
  staffLocations          StaffLocation[]
  staffServices           StaffService[]
  locationBusinessHours   LocationBusinessHour[]
  staffAvailabilityRules  StaffAvailabilityRule[]
  resourceAvailability    ResourceAvailabilityRule[]
  resourceBlocks          ResourceBlock[]
  bookings                Booking[]
  bookingResources        BookingResource[]
  bookingStaff            BookingStaff[]
  visits                  Visit[]
  serviceSessions         ServiceSession[]
  visitSessions           VisitSession[]
  sessionParticipants     SessionParticipant[]
  sessionResources        SessionResource[]
  sessionStaff            SessionStaff[]
  courses                 Course[]
  courseRuns              CourseRun[]
  courseSessions          CourseSession[]
  courseEnrollments       CourseEnrollment[]
  attendances             Attendance[]
  orders                  Order[]
  orderItems              OrderItem[]
  payments                Payment[]
  refunds                 Refund[]

  @@map("tenants")
}

model User {
  id              String    @id @default(uuid()) @db.Uuid
  name            String
  email           String    @unique
  passwordHash    String?
  phone           String?
  emailVerifiedAt DateTime? @db.Timestamptz(3)
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(3)

  memberships  TenantMembership[]
  staffProfiles StaffProfile[]

  @@map("users")
}

model TenantMembership {
  id        String           @id @default(uuid()) @db.Uuid
  tenantId  String           @db.Uuid
  userId    String           @db.Uuid
  role      TenantRole       @default(STAFF)
  status    MembershipStatus @default(INVITED)
  joinedAt  DateTime?        @db.Timestamptz(3)
  createdAt DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt DateTime         @updatedAt @db.Timestamptz(3)

  tenant          Tenant       @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  user            User         @relation(fields: [userId], references: [id], onDelete: Restrict)
  customerNotes   CustomerNote[] @relation("CustomerNoteAuthor")
  bookingsCreated Booking[]    @relation("BookingCreator")
  visitsCreated   Visit[]      @relation("VisitCreator")
  paymentsReceived Payment[]   @relation("PaymentReceiver")
  attendanceMarked Attendance[] @relation("AttendanceMarker")

  @@unique([tenantId, userId])
  @@unique([tenantId, id])
  @@index([userId, status])
  @@index([tenantId, role, status])
  @@map("tenant_memberships")
}

model BusinessProfile {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @unique @db.Uuid
  displayName   String
  description   String?
  logoUrl       String?
  coverImageUrl String?
  email         String?
  phone         String?
  website       String?
  createdAt     DateTime @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime @updatedAt @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Restrict)

  @@map("business_profiles")
}

model Location {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @db.Uuid
  name          String
  slug          String
  addressLine1  String?
  addressLine2  String?
  city          String?
  stateOrRegion String?
  postalCode    String?
  countryCode   String   @db.VarChar(2)
  timezone      String   @default("Asia/Dhaka")
  phone         String?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime @updatedAt @db.Timestamptz(3)

  tenant                Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  serviceLocations      ServiceLocation[]
  resources             Resource[]
  staffLocations        StaffLocation[]
  staffAvailabilityRules StaffAvailabilityRule[]
  locationBusinessHours LocationBusinessHour[]
  bookings              Booking[]
  visits                Visit[]
  serviceSessions       ServiceSession[]
  courseRuns            CourseRun[]
  orders                Order[]

  @@unique([tenantId, slug])
  @@unique([tenantId, id])
  @@index([tenantId, isActive])
  @@map("locations")
}

model Customer {
  id        String         @id @default(uuid()) @db.Uuid
  tenantId  String         @db.Uuid
  name      String
  email     String?
  phone     String?
  status    CustomerStatus @default(ACTIVE)
  notes     String?
  createdAt DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt DateTime       @updatedAt @db.Timestamptz(3)

  tenant             Tenant               @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  customerNotes      CustomerNote[]
  tagAssignments     CustomerTagAssignment[]
  bookings           Booking[]
  visits             Visit[]
  sessionParticipation SessionParticipant[]
  courseEnrollments  CourseEnrollment[]
  orders             Order[]

  @@unique([tenantId, id])
  @@index([tenantId, name])
  @@index([tenantId, phone])
  @@index([tenantId, email])
  @@map("customers")
}

model CustomerNote {
  id                      String   @id @default(uuid()) @db.Uuid
  tenantId                String   @db.Uuid
  customerId              String   @db.Uuid
  createdByMembershipId   String?  @db.Uuid
  content                 String
  createdAt               DateTime @default(now()) @db.Timestamptz(3)
  updatedAt               DateTime @updatedAt @db.Timestamptz(3)

  tenant        Tenant            @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  customer      Customer          @relation(fields: [customerId], references: [id], onDelete: Restrict)
  createdBy     TenantMembership? @relation("CustomerNoteAuthor", fields: [createdByMembershipId], references: [id], onDelete: SetNull)

  @@index([tenantId, customerId, createdAt])
  @@map("customer_notes")
}

model CustomerTag {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @db.Uuid
  name      String
  color     String?
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  tenant      Tenant                  @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  assignments CustomerTagAssignment[]

  @@unique([tenantId, name])
  @@map("customer_tags")
}

model CustomerTagAssignment {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @db.Uuid
  customerId    String   @db.Uuid
  customerTagId String   @db.Uuid
  createdAt     DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant      @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  customer Customer  @relation(fields: [customerId], references: [id], onDelete: Cascade)
  tag      CustomerTag @relation(fields: [customerTagId], references: [id], onDelete: Cascade)

  @@unique([customerId, customerTagId])
  @@index([tenantId, customerTagId])
  @@map("customer_tag_assignments")
}

model ServiceCategory {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @db.Uuid
  name        String
  description String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @db.Timestamptz(3)

  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  services Service[]

  @@unique([tenantId, name])
  @@map("service_categories")
}

model Service {
  id              String         @id @default(uuid()) @db.Uuid
  tenantId        String         @db.Uuid
  categoryId      String?        @db.Uuid
  name            String
  description     String?
  bookingStrategy BookingStrategy
  durationMinutes Int?
  basePrice       Decimal        @db.Decimal(12, 2)
  currency        String         @db.VarChar(3)
  defaultCapacity Int?
  requiresStaff   Boolean        @default(false)
  requiresResource Boolean       @default(false)
  isActive        Boolean        @default(true)
  createdAt       DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime       @updatedAt @db.Timestamptz(3)

  tenant           Tenant             @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  category         ServiceCategory?   @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  serviceLocations ServiceLocation[]
  serviceResources ServiceResource[]
  staffServices    StaffService[]
  bookings         Booking[]
  serviceSessions  ServiceSession[]
  orderItems       OrderItem[]

  @@unique([tenantId, id])
  @@index([tenantId, isActive])
  @@index([tenantId, categoryId])
  @@map("services")
}

model ServiceLocation {
  id         String  @id @default(uuid()) @db.Uuid
  tenantId   String  @db.Uuid
  serviceId  String  @db.Uuid
  locationId String  @db.Uuid
  isActive   Boolean @default(true)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  service  Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@unique([serviceId, locationId])
  @@index([tenantId, locationId, isActive])
  @@map("service_locations")
}

model Resource {
  id          String         @id @default(uuid()) @db.Uuid
  tenantId    String         @db.Uuid
  locationId  String         @db.Uuid
  name        String
  type        String
  description String?
  status      ResourceStatus @default(ACTIVE)
  isActive    Boolean        @default(true)
  createdAt   DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime       @updatedAt @db.Timestamptz(3)

  tenant               Tenant                    @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  location             Location                  @relation(fields: [locationId], references: [id], onDelete: Restrict)
  serviceResources     ServiceResource[]
  availabilityRules    ResourceAvailabilityRule[]
  blocks               ResourceBlock[]
  bookingResources     BookingResource[]
  sessionResources     SessionResource[]

  @@unique([tenantId, id])
  @@index([tenantId, locationId, status])
  @@map("resources")
}

model ServiceResource {
  id         String  @id @default(uuid()) @db.Uuid
  tenantId   String  @db.Uuid
  serviceId  String  @db.Uuid
  resourceId String  @db.Uuid
  isRequired Boolean @default(true)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  service  Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  resource Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)

  @@unique([serviceId, resourceId])
  @@index([tenantId, resourceId])
  @@map("service_resources")
}

model StaffProfile {
  id               String           @id @default(uuid()) @db.Uuid
  tenantId         String           @db.Uuid
  userId           String?          @db.Uuid
  displayName      String
  email            String?
  phone            String?
  employmentStatus EmploymentStatus @default(ACTIVE)
  joinedAt         DateTime?        @db.Date
  createdAt        DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime         @updatedAt @db.Timestamptz(3)

  tenant              Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  user                User?                    @relation(fields: [userId], references: [id], onDelete: SetNull)
  staffLocations      StaffLocation[]
  staffServices       StaffService[]
  availabilityRules   StaffAvailabilityRule[]
  bookingAssignments  BookingStaff[]
  sessionAssignments SessionStaff[]

  @@unique([tenantId, id])
  @@index([tenantId, employmentStatus])
  @@index([userId])
  @@map("staff_profiles")
}

model StaffLocation {
  id         String @id @default(uuid()) @db.Uuid
  tenantId   String @db.Uuid
  staffId    String @db.Uuid
  locationId String @db.Uuid

  tenant   Tenant      @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  staff    StaffProfile @relation(fields: [staffId], references: [id], onDelete: Cascade)
  location Location    @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@unique([staffId, locationId])
  @@index([tenantId, locationId])
  @@map("staff_locations")
}

model StaffService {
  id        String @id @default(uuid()) @db.Uuid
  tenantId  String @db.Uuid
  staffId   String @db.Uuid
  serviceId String @db.Uuid

  tenant  Tenant      @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  staff   StaffProfile @relation(fields: [staffId], references: [id], onDelete: Cascade)
  service Service     @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@unique([staffId, serviceId])
  @@index([tenantId, serviceId])
  @@map("staff_services")
}

model LocationBusinessHour {
  id         String  @id @default(uuid()) @db.Uuid
  tenantId   String  @db.Uuid
  locationId String  @db.Uuid
  dayOfWeek  Int
  opensAt    DateTime @db.Time(0)
  closesAt   DateTime @db.Time(0)
  isClosed   Boolean @default(false)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  location Location @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@index([tenantId, locationId, dayOfWeek])
  @@map("location_business_hours")
}

model StaffAvailabilityRule {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  staffId    String   @db.Uuid
  locationId String?  @db.Uuid
  dayOfWeek  Int
  startTime  DateTime @db.Time(0)
  endTime    DateTime @db.Time(0)
  isActive   Boolean  @default(true)

  tenant   Tenant       @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  staff    StaffProfile @relation(fields: [staffId], references: [id], onDelete: Cascade)
  location Location?    @relation(fields: [locationId], references: [id], onDelete: SetNull)

  @@index([tenantId, staffId, dayOfWeek, isActive])
  @@map("staff_availability_rules")
}

model ResourceAvailabilityRule {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  resourceId String   @db.Uuid
  dayOfWeek  Int
  startTime  DateTime @db.Time(0)
  endTime    DateTime @db.Time(0)
  isActive   Boolean  @default(true)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  resource Resource @relation(fields: [resourceId], references: [id], onDelete: Cascade)

  @@index([tenantId, resourceId, dayOfWeek, isActive])
  @@map("resource_availability_rules")
}

model ResourceBlock {
  id         String              @id @default(uuid()) @db.Uuid
  tenantId   String              @db.Uuid
  resourceId String              @db.Uuid
  startAt    DateTime            @db.Timestamptz(3)
  endAt      DateTime            @db.Timestamptz(3)
  reason     String?
  status     ResourceBlockStatus @default(ACTIVE)
  createdAt  DateTime            @default(now()) @db.Timestamptz(3)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  resource Resource @relation(fields: [resourceId], references: [id], onDelete: Restrict)

  @@index([tenantId, resourceId, startAt, endAt])
  @@map("resource_blocks")
}

model Booking {
  id                    String        @id @default(uuid()) @db.Uuid
  tenantId              String        @db.Uuid
  locationId            String        @db.Uuid
  customerId            String        @db.Uuid
  serviceId             String        @db.Uuid
  bookingNumber         String
  startAt               DateTime      @db.Timestamptz(3)
  endAt                 DateTime      @db.Timestamptz(3)
  status                BookingStatus @default(PENDING)
  source                BookingSource
  quotedAmount          Decimal       @db.Decimal(12, 2)
  currency              String        @db.VarChar(3)
  notes                 String?
  createdByMembershipId String?       @db.Uuid
  createdAt             DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime      @updatedAt @db.Timestamptz(3)

  tenant      Tenant             @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  location    Location           @relation(fields: [locationId], references: [id], onDelete: Restrict)
  customer    Customer           @relation(fields: [customerId], references: [id], onDelete: Restrict)
  service     Service            @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  createdBy   TenantMembership?  @relation("BookingCreator", fields: [createdByMembershipId], references: [id], onDelete: SetNull)
  resources   BookingResource[]
  staff       BookingStaff[]
  visit       Visit?

  @@unique([tenantId, bookingNumber])
  @@unique([tenantId, id])
  @@index([tenantId, locationId, startAt])
  @@index([tenantId, status, startAt])
  @@index([tenantId, customerId, createdAt])
  @@map("bookings")
}

model BookingResource {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  bookingId  String   @db.Uuid
  resourceId String   @db.Uuid
  startAt    DateTime @db.Timestamptz(3)
  endAt      DateTime @db.Timestamptz(3)

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  booking  Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  resource Resource @relation(fields: [resourceId], references: [id], onDelete: Restrict)

  @@index([tenantId, resourceId, startAt, endAt])
  @@map("booking_resources")
}

model BookingStaff {
  id        String @id @default(uuid()) @db.Uuid
  tenantId  String @db.Uuid
  bookingId String @db.Uuid
  staffId   String @db.Uuid

  tenant  Tenant      @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  booking Booking     @relation(fields: [bookingId], references: [id], onDelete: Cascade)
  staff   StaffProfile @relation(fields: [staffId], references: [id], onDelete: Restrict)

  @@unique([bookingId, staffId])
  @@index([tenantId, staffId])
  @@map("booking_staff")
}

model Visit {
  id                    String      @id @default(uuid()) @db.Uuid
  tenantId              String      @db.Uuid
  locationId            String      @db.Uuid
  customerId            String      @db.Uuid
  bookingId             String?     @unique @db.Uuid
  visitNumber           String
  source                VisitSource
  status                VisitStatus @default(CHECKED_IN)
  checkedInAt           DateTime    @db.Timestamptz(3)
  checkedOutAt          DateTime?   @db.Timestamptz(3)
  notes                 String?
  createdByMembershipId String?     @db.Uuid
  createdAt             DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime    @updatedAt @db.Timestamptz(3)

  tenant    Tenant             @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  location  Location           @relation(fields: [locationId], references: [id], onDelete: Restrict)
  customer  Customer           @relation(fields: [customerId], references: [id], onDelete: Restrict)
  booking   Booking?           @relation(fields: [bookingId], references: [id], onDelete: Restrict)
  createdBy TenantMembership?  @relation("VisitCreator", fields: [createdByMembershipId], references: [id], onDelete: SetNull)
  sessions  VisitSession[]
  orders    Order[]

  @@unique([tenantId, visitNumber])
  @@unique([tenantId, id])
  @@index([tenantId, locationId, checkedInAt])
  @@index([tenantId, customerId, createdAt])
  @@map("visits")
}

model ServiceSession {
  id               String               @id @default(uuid()) @db.Uuid
  tenantId         String               @db.Uuid
  locationId       String               @db.Uuid
  serviceId        String               @db.Uuid
  sessionNumber    String
  scheduledStartAt DateTime?            @db.Timestamptz(3)
  scheduledEndAt   DateTime?            @db.Timestamptz(3)
  actualStartAt    DateTime?            @db.Timestamptz(3)
  actualEndAt      DateTime?            @db.Timestamptz(3)
  status           ServiceSessionStatus @default(SCHEDULED)
  capacity         Int?
  notes            String?
  createdAt        DateTime             @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime             @updatedAt @db.Timestamptz(3)

  tenant          Tenant                @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  location        Location              @relation(fields: [locationId], references: [id], onDelete: Restrict)
  service         Service               @relation(fields: [serviceId], references: [id], onDelete: Restrict)
  visits          VisitSession[]
  participants    SessionParticipant[]
  resources       SessionResource[]
  staff           SessionStaff[]
  courseSession   CourseSession?

  @@unique([tenantId, sessionNumber])
  @@unique([tenantId, id])
  @@index([tenantId, locationId, scheduledStartAt])
  @@index([tenantId, status])
  @@map("service_sessions")
}

model VisitSession {
  id               String   @id @default(uuid()) @db.Uuid
  tenantId         String   @db.Uuid
  visitId          String   @db.Uuid
  serviceSessionId String   @db.Uuid
  createdAt        DateTime @default(now()) @db.Timestamptz(3)

  tenant         Tenant         @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  visit          Visit          @relation(fields: [visitId], references: [id], onDelete: Cascade)
  serviceSession ServiceSession @relation(fields: [serviceSessionId], references: [id], onDelete: Cascade)

  @@unique([visitId, serviceSessionId])
  @@index([tenantId, serviceSessionId])
  @@map("visit_sessions")
}

model SessionParticipant {
  id               String            @id @default(uuid()) @db.Uuid
  tenantId         String            @db.Uuid
  serviceSessionId String            @db.Uuid
  customerId       String            @db.Uuid
  status           ParticipantStatus @default(REGISTERED)
  joinedAt         DateTime?         @db.Timestamptz(3)
  leftAt           DateTime?         @db.Timestamptz(3)
  createdAt        DateTime          @default(now()) @db.Timestamptz(3)

  tenant         Tenant         @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  serviceSession ServiceSession @relation(fields: [serviceSessionId], references: [id], onDelete: Cascade)
  customer       Customer       @relation(fields: [customerId], references: [id], onDelete: Restrict)

  @@unique([serviceSessionId, customerId])
  @@index([tenantId, customerId])
  @@map("session_participants")
}

model SessionResource {
  id               String    @id @default(uuid()) @db.Uuid
  tenantId         String    @db.Uuid
  serviceSessionId String    @db.Uuid
  resourceId       String    @db.Uuid
  allocatedStartAt DateTime  @db.Timestamptz(3)
  allocatedEndAt   DateTime? @db.Timestamptz(3)
  createdAt        DateTime  @default(now()) @db.Timestamptz(3)

  tenant         Tenant         @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  serviceSession ServiceSession @relation(fields: [serviceSessionId], references: [id], onDelete: Cascade)
  resource       Resource       @relation(fields: [resourceId], references: [id], onDelete: Restrict)

  @@index([tenantId, resourceId, allocatedStartAt, allocatedEndAt])
  @@map("session_resources")
}

model SessionStaff {
  id               String    @id @default(uuid()) @db.Uuid
  tenantId         String    @db.Uuid
  serviceSessionId String    @db.Uuid
  staffId          String    @db.Uuid
  assignedAt       DateTime  @default(now()) @db.Timestamptz(3)
  releasedAt       DateTime? @db.Timestamptz(3)

  tenant         Tenant         @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  serviceSession ServiceSession @relation(fields: [serviceSessionId], references: [id], onDelete: Cascade)
  staff          StaffProfile   @relation(fields: [staffId], references: [id], onDelete: Restrict)

  @@unique([serviceSessionId, staffId])
  @@index([tenantId, staffId])
  @@map("session_staff")
}

model Course {
  id                 String   @id @default(uuid()) @db.Uuid
  tenantId           String   @db.Uuid
  name               String
  description        String?
  defaultDurationDays Int?
  basePrice          Decimal  @db.Decimal(12, 2)
  currency           String   @db.VarChar(3)
  isActive           Boolean  @default(true)
  createdAt          DateTime @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime @updatedAt @db.Timestamptz(3)

  tenant Tenant      @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  runs   CourseRun[]

  @@unique([tenantId, id])
  @@index([tenantId, isActive])
  @@map("courses")
}

model CourseRun {
  id                 String         @id @default(uuid()) @db.Uuid
  tenantId           String         @db.Uuid
  courseId           String         @db.Uuid
  locationId         String         @db.Uuid
  name               String
  startDate          DateTime       @db.Date
  endDate            DateTime       @db.Date
  capacity           Int?
  enrollmentDeadline DateTime?      @db.Timestamptz(3)
  status             CourseRunStatus @default(DRAFT)
  createdAt          DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime       @updatedAt @db.Timestamptz(3)

  tenant       Tenant             @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  course       Course             @relation(fields: [courseId], references: [id], onDelete: Restrict)
  location     Location           @relation(fields: [locationId], references: [id], onDelete: Restrict)
  sessions     CourseSession[]
  enrollments  CourseEnrollment[]

  @@unique([tenantId, id])
  @@index([tenantId, locationId, status, startDate])
  @@map("course_runs")
}

model CourseSession {
  id               String             @id @default(uuid()) @db.Uuid
  tenantId         String             @db.Uuid
  courseRunId      String             @db.Uuid
  serviceSessionId String             @unique @db.Uuid
  sessionNumber    Int
  startAt          DateTime           @db.Timestamptz(3)
  endAt            DateTime           @db.Timestamptz(3)
  topic            String?
  status           CourseSessionStatus @default(SCHEDULED)
  createdAt        DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime           @updatedAt @db.Timestamptz(3)

  tenant         Tenant         @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  courseRun      CourseRun      @relation(fields: [courseRunId], references: [id], onDelete: Restrict)
  serviceSession ServiceSession @relation(fields: [serviceSessionId], references: [id], onDelete: Restrict)
  attendances    Attendance[]

  @@unique([courseRunId, sessionNumber])
  @@index([tenantId, startAt])
  @@map("course_sessions")
}

model CourseEnrollment {
  id                String           @id @default(uuid()) @db.Uuid
  tenantId          String           @db.Uuid
  courseRunId       String           @db.Uuid
  customerId        String           @db.Uuid
  enrollmentNumber  String
  enrolledAt        DateTime         @default(now()) @db.Timestamptz(3)
  agreedFee         Decimal          @db.Decimal(12, 2)
  currency          String           @db.VarChar(3)
  status            EnrollmentStatus @default(PENDING)
  createdAt         DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime         @updatedAt @db.Timestamptz(3)

  tenant       Tenant       @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  courseRun    CourseRun    @relation(fields: [courseRunId], references: [id], onDelete: Restrict)
  customer     Customer     @relation(fields: [customerId], references: [id], onDelete: Restrict)
  attendances  Attendance[]

  @@unique([tenantId, enrollmentNumber])
  @@unique([courseRunId, customerId])
  @@index([tenantId, customerId])
  @@map("course_enrollments")
}

model Attendance {
  id                     String           @id @default(uuid()) @db.Uuid
  tenantId               String           @db.Uuid
  courseSessionId        String           @db.Uuid
  enrollmentId           String           @db.Uuid
  status                 AttendanceStatus
  markedByMembershipId   String?          @db.Uuid
  markedAt               DateTime         @default(now()) @db.Timestamptz(3)
  notes                  String?

  tenant       Tenant           @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  courseSession CourseSession   @relation(fields: [courseSessionId], references: [id], onDelete: Cascade)
  enrollment   CourseEnrollment @relation(fields: [enrollmentId], references: [id], onDelete: Cascade)
  markedBy     TenantMembership? @relation("AttendanceMarker", fields: [markedByMembershipId], references: [id], onDelete: SetNull)

  @@unique([courseSessionId, enrollmentId])
  @@index([tenantId, enrollmentId])
  @@map("attendances")
}

model Order {
  id          String      @id @default(uuid()) @db.Uuid
  tenantId    String      @db.Uuid
  locationId  String      @db.Uuid
  customerId  String?     @db.Uuid
  visitId     String?     @db.Uuid
  orderNumber String
  subtotal    Decimal     @db.Decimal(12, 2)
  discountAmount Decimal  @default(0) @db.Decimal(12, 2)
  taxAmount   Decimal     @default(0) @db.Decimal(12, 2)
  totalAmount Decimal     @db.Decimal(12, 2)
  currency    String      @db.VarChar(3)
  status      OrderStatus @default(OPEN)
  createdAt   DateTime    @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime    @updatedAt @db.Timestamptz(3)

  tenant   Tenant       @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  location Location     @relation(fields: [locationId], references: [id], onDelete: Restrict)
  customer Customer?    @relation(fields: [customerId], references: [id], onDelete: SetNull)
  visit    Visit?       @relation(fields: [visitId], references: [id], onDelete: SetNull)
  items    OrderItem[]
  payments Payment[]

  @@unique([tenantId, orderNumber])
  @@unique([tenantId, id])
  @@index([tenantId, locationId, createdAt])
  @@index([tenantId, customerId])
  @@map("orders")
}

model OrderItem {
  id             String   @id @default(uuid()) @db.Uuid
  tenantId       String   @db.Uuid
  orderId        String   @db.Uuid
  serviceId      String?  @db.Uuid
  description    String
  quantity       Decimal  @default(1) @db.Decimal(10, 2)
  unitPrice      Decimal  @db.Decimal(12, 2)
  discountAmount Decimal  @default(0) @db.Decimal(12, 2)
  taxAmount      Decimal  @default(0) @db.Decimal(12, 2)
  lineTotal      Decimal  @db.Decimal(12, 2)
  createdAt      DateTime @default(now()) @db.Timestamptz(3)

  tenant  Tenant   @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  order   Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  service Service? @relation(fields: [serviceId], references: [id], onDelete: SetNull)

  @@index([tenantId, orderId])
  @@map("order_items")
}

model Payment {
  id                    String        @id @default(uuid()) @db.Uuid
  tenantId              String        @db.Uuid
  orderId               String        @db.Uuid
  paymentNumber         String
  amount                Decimal       @db.Decimal(12, 2)
  currency              String        @db.VarChar(3)
  method                PaymentMethod
  status                PaymentStatus @default(PENDING)
  provider              String?
  providerReference     String?
  idempotencyKey        String?
  receivedByMembershipId String?      @db.Uuid
  paidAt                DateTime?     @db.Timestamptz(3)
  createdAt             DateTime      @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime      @updatedAt @db.Timestamptz(3)

  tenant     Tenant            @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  order      Order             @relation(fields: [orderId], references: [id], onDelete: Restrict)
  receivedBy TenantMembership? @relation("PaymentReceiver", fields: [receivedByMembershipId], references: [id], onDelete: SetNull)
  refunds    Refund[]

  @@unique([tenantId, paymentNumber])
  @@index([tenantId, orderId, status])
  @@index([provider, providerReference])
  @@index([tenantId, idempotencyKey])
  @@map("payments")
}

model Refund {
  id                String       @id @default(uuid()) @db.Uuid
  tenantId          String       @db.Uuid
  paymentId         String       @db.Uuid
  amount            Decimal      @db.Decimal(12, 2)
  status            RefundStatus @default(PENDING)
  reason            String?
  providerReference String?
  processedAt       DateTime?    @db.Timestamptz(3)
  createdAt         DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt         DateTime     @updatedAt @db.Timestamptz(3)

  tenant  Tenant  @relation(fields: [tenantId], references: [id], onDelete: Restrict)
  payment Payment @relation(fields: [paymentId], references: [id], onDelete: Restrict)

  @@index([tenantId, paymentId, status])
  @@index([providerReference])
  @@map("refunds")
}
```

## 24.3 Important implementation notes for this Prisma schema

### Tenant-aware foreign keys

The Prisma relations above use the referenced record's UUID as the
foreign key and include `tenantId` as a separate tenant relation. This
is straightforward to maintain in Prisma, but by itself it does **not**
guarantee that a referenced customer, resource, service, or location
belongs to the same tenant.

Every service-layer operation must validate tenant ownership. For
stronger database enforcement, add composite foreign keys in custom SQL
migrations. The referenced models already expose composite unique keys
such as `@@unique([tenantId, id])` where needed; then migrate selected
relations to reference both `tenantId` and the related record ID.
Validate the generated migration carefully because Prisma schema support
and relation definitions must match the final database constraints.

### Constraints requiring custom SQL

Prisma schema syntax does not express every PostgreSQL constraint needed
by this product. Add and test custom migrations for:

1.  **Resource overlap prevention:** use a PostgreSQL GiST exclusion
    constraint over the resource ID and a
    `tstzrange(startAt, endAt, '[)')` range. Exclude cancelled bookings
    and cancelled blocks as appropriate. Consider the `btree_gist`
    extension.
2.  **Session resource overlap prevention:** prevent overlapping active
    allocations for the same resource.
3.  **Time validation:** require `endAt > startAt` for bookings, blocks,
    shifts, and populated session intervals.
4.  **Capacity enforcement:** use transactional locking or another
    concurrency-safe approach when adding participants or course
    enrollments.
5.  **Refund limit:** ensure successful refunds against a payment never
    exceed the captured payment amount.
6.  **Tenant consistency:** use composite foreign keys for tenant-owned
    references where practical.

### Availability override implementation

The logical model describes availability overrides for locations, staff,
and resources. The core Prisma schema above does not include a generic
polymorphic override table because a single `targetType + targetId` pair
cannot have a normal relational foreign key to three different target
tables. Add separate `LocationAvailabilityOverride`,
`StaffAvailabilityOverride`, and `ResourceAvailabilityOverride` models
when exception scheduling is implemented.

### Time fields

Prisma represents PostgreSQL `TIME` columns using
`DateTime @db.Time(0)`. Treat these values as local wall-clock times
associated with the relevant location timezone; do not interpret them as
UTC instants.

### Deletion policy

The schema uses `Restrict` for important historical references and
`Cascade` mainly for dependent join/child records such as tag
assignments and booking resource rows. Review every `onDelete` rule
against the final business retention policy before production
migrations.

### Prisma validation and migration workflow

Run these commands from the project root after creating the schema:

``` bash
bunx prisma format
bunx prisma validate
bunx prisma migrate dev --name init_business_operations
bunx prisma generate
```

If using a Prisma version that separates the client generator or
datasource configuration differently, follow that installed version's
documentation and keep the schema, generator, and migration tooling on
compatible versions.

------------------------------------------------------------------------

# 25. Suggested project structure

A practical starting structure for Prisma and database-related code:

``` text
prisma/
  schema.prisma
  migrations/
    ...

src/
  config/
    env.ts
  lib/
    prisma.ts
  modules/
    tenants/
    memberships/
    locations/
    customers/
    services/
    resources/
    staff/
    availability/
    bookings/
    visits/
    service-sessions/
    courses/
    orders/
    payments/
```

Keep Prisma model definitions in `schema.prisma`. Put tenant
authorization, validation, transaction orchestration, and business rules
in the relevant application modules rather than embedding business
workflows in controllers.

## 25.1 Before the first migration

-   [ ] Confirm the open decisions in Section 22.
-   [ ] Confirm the exact Prisma major version used by the project.
-   [ ] Run `prisma format` and `prisma validate`.
-   [ ] Review all relation and deletion behaviors.
-   [ ] Add tenant-aware composite foreign keys or equivalent database
    enforcement.
-   [ ] Add PostgreSQL exclusion constraints for resource conflicts.
-   [ ] Add check constraints for valid time intervals and positive
    amounts.
-   [ ] Test concurrent booking, enrollment, payment, and refund
    requests.
-   [ ] Seed a tenant, owner membership, location, services, and
    resources.
-   [ ] Verify that every tenant-scoped query is filtered by the
    authenticated tenant context.
