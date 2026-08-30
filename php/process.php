<?php
header("Access-Control-Allow-Origin: http://localhost");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Whitelist of allowed methods to prevent Remote Code Execution
$allowedMethods = [
    'getAllLabours',
    'getAllClients',
    'getAllClientsWithParam',
    'getAllLabourWithParam',
    'getClientInvoice',
    'getAllTransaction',
    'getClientTransaction',
    'getLabourTransaction',
    'getRoutine',
    'getServiceMaster',
    'getService',
    'setServiced',
    'insertService',
    'updateTrans',
    'onCreateLabor',
    'onUpdateClient',
    'onCreateClient',
    'onCreateATransaction',
    'getKhazana',
    'getLabourAnalytics',
    'getProfitLoss',
    'insertProfitLoss',
    'getOffices',
    'getMachines',
    'createMachine',
    'getMachineExpenses',
    'insertMachineExpense',
    'getMachineExpenseReport',
    'getRates',
    'updateRate',
    'getNotices',
    'saveNotice',
    'deleteNotice',
    'setNoticesEnabled',
    'getOldData',
    'getDailyKhata',
    'saveKhataEntry',
    'deleteKhataEntry',
    'getKhataOpening',
    'setKhataOpening',
    'getClientOpenings',
    'saveClientOpenings',
    'getClientBalances',
    'getClientLedger',
    'getTagadaSlip',
    'getKhataMonthlySummary',
    'getElectricityMeters',
    'saveElectricityMeter',
    'deleteElectricityMeter',
    'getElectricityBills',
    'saveElectricityBill',
    'deleteElectricityBill'
];

$method = isset($_POST["method"]) ? $_POST["method"] : '';

if (!in_array($method, $allowedMethods, true)) {
    http_response_code(400);
    echo json_encode(["error" => "Invalid method"]);
    exit;
}

echo $method();

// --- Database Connection ---

function getDbConnection() {
    static $conn = null;
    if ($conn === null || !$conn->ping()) {
        $servername = "localhost";
        $username = "root";
        $password = "";
        $dbname = "hisabkitab";
        // Suppress mysqli throwing exceptions; we handle errors via return codes
        mysqli_report(MYSQLI_REPORT_OFF);
        $conn = new mysqli($servername, $username, $password, $dbname);
        if ($conn->connect_error) {
            http_response_code(500);
            echo json_encode(["error" => "Database connection failed"]);
            exit;
        }
        $conn->set_charset("utf8mb4");
    }
    return $conn;
}

function fetchAll($result) {
    $data = [];
    while ($row = $result->fetch_assoc()) {
        $data[] = $row;
    }
    return $data;
}

function getPostData() {
    if (!isset($_POST["data"])) {
        return null;
    }
    $obj = json_decode($_POST["data"]);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(["error" => "Invalid JSON data"]);
        exit;
    }
    return $obj;
}

// --- Rate configuration (single source of truth for pricing) ---

// Returns [ 'Softening' => ['rate'=>..,'base'=>..,'free_qty'=>..], ... ]
function getRateConfig($conn) {
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }
    $cache = [];
    $result = @$conn->query("SELECT machineType, rate, base, free_qty FROM rate_config");
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $cache[$row['machineType']] = [
                'rate' => (float)$row['rate'],
                'base' => (float)$row['base'],
                'free_qty' => (float)$row['free_qty'],
            ];
        }
    }
    return $cache;
}

// Authoritative pricing. For any machineType present in rate_config the total is
// derived from config and the client-supplied rate/total are IGNORED. Returns
// ['rate'=>float, 'total'=>float]. For unconfigured types, falls back to the
// client-supplied rate * quantity (legacy behaviour).
function priceTransaction($conn, $machineType, $clientRate, $quantity) {
    $cfg = getRateConfig($conn);
    if (isset($cfg[$machineType])) {
        $rate = $cfg[$machineType]['rate'];
        $base = $cfg[$machineType]['base'];
        $free = $cfg[$machineType]['free_qty'];
        if ($quantity <= $free) {
            $total = $base;
        } else {
            $total = $base + $rate * ($quantity - $free);
        }
        return ['rate' => $rate, 'total' => $total];
    }
    return ['rate' => (float)$clientRate, 'total' => (float)$clientRate * (float)$quantity];
}

// --- API Functions ---

function getAllLabours() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT * FROM masterlabor");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getAllClients() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT * FROM masterclient ORDER BY client ASC");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getAllClientsWithParam() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = $obj->month;
    $year = $obj->year;
    $machineType = $obj->machineType;
    $officeType = $obj->officeType;

    $conditions = ["month = ?", "year = ?"];
    $types = "ss";
    $params = [$month, $year];

    if ($machineType !== "All") {
        $conditions[] = "machineType = ?";
        $types .= "s";
        $params[] = $machineType;
    } else {
        $conditions[] = "machineType != ''";
    }

    if ($officeType !== "All") {
        $conditions[] = "cc = ?";
        $types .= "s";
        $params[] = $officeType;
    } else {
        $conditions[] = "cc != ''";
    }

    $sql = "SELECT DISTINCT client FROM transaction WHERE " . implode(" AND ", $conditions) . " ORDER BY client ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getAllLabourWithParam() {
    $conn = getDbConnection();
    $obj = getPostData();
    $officeType = $obj->officeType;

    if ($officeType !== "All") {
        $stmt = $conn->prepare("SELECT DISTINCT labour FROM transaction WHERE cc = ? ORDER BY labour ASC");
        $stmt->bind_param("s", $officeType);
    } else {
        $stmt = $conn->prepare("SELECT DISTINCT labour FROM transaction WHERE cc != '' ORDER BY labour ASC");
    }

    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getClientInvoice() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = $obj->month;
    $year = $obj->year;
    $machineType = $obj->machineType;
    $officeType = $obj->officeType;
    $Client = $obj->Client;

    $conditions = ["month = ?", "year = ?", "machineType != 'Thokai'"];
    $types = "ss";
    $params = [$month, $year];

    if ($officeType !== "All") {
        $conditions[] = "cc = ?";
        $types .= "s";
        $params[] = $officeType;
    } else {
        $conditions[] = "cc != ''";
    }

    if ($Client !== "All") {
        $conditions[] = "client = ?";
        $types .= "s";
        $params[] = $Client;
    } else {
        $conditions[] = "client != ''";
    }

    $sql = "SELECT * FROM transaction WHERE " . implode(" AND ", $conditions) . " ORDER BY machineType ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getAllTransaction() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT * FROM transaction ORDER BY `year` DESC, `month` DESC, `date` DESC");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getClientTransaction() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = $obj->month;
    $year = $obj->year;
    $machineType = $obj->machineType;
    $officeType = $obj->officeType;
    $Client = $obj->Client;

    $conditions = ["month = ?", "year = ?"];
    $types = "ss";
    $params = [$month, $year];

    if ($machineType !== "All") {
        $conditions[] = "machineType = ?";
        $types .= "s";
        $params[] = $machineType;
    } else {
        $conditions[] = "machineType != ''";
    }

    if ($officeType !== "All") {
        $conditions[] = "cc = ?";
        $types .= "s";
        $params[] = $officeType;
    } else {
        $conditions[] = "cc != ''";
    }

    if ($Client !== "All") {
        $conditions[] = "client = ?";
        $types .= "s";
        $params[] = $Client;
    } else {
        $conditions[] = "client != ''";
    }

    $sql = "SELECT * FROM transaction WHERE " . implode(" AND ", $conditions) . " ORDER BY `year` DESC, `month` DESC, `date` DESC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getLabourTransaction() {
    $conn = getDbConnection();
    $obj = getPostData();
    $name = $obj->Labour;
    $officeType = $obj->office;
    $start = $obj->start;
    $end = $obj->end;

    $conditions = ["labour = ?", "str_to_date(date, '%d/%m/%Y') BETWEEN ? AND ?"];
    $types = "sss";
    $params = [$name, $start, $end];

    if ($officeType !== "All") {
        $conditions[] = "cc = ?";
        $types .= "s";
        $params[] = $officeType;
    } else {
        $conditions[] = "cc != ''";
    }

    $sql = "SELECT * FROM transaction WHERE " . implode(" AND ", $conditions) . " ORDER BY `year` ASC, `month` ASC, `date` ASC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getRoutine() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT * FROM routine ORDER BY Name ASC");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getServiceMaster() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT DISTINCT machineName, cc, max(servicedOn) as servicedOn FROM service GROUP BY machineName, cc ORDER BY cc ASC");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getService() {
    $conn = getDbConnection();
    $obj = getPostData();
    $machineName = $obj->machineName;
    $cc = $obj->cc;

    $stmt = $conn->prepare("SELECT * FROM service WHERE `machineName` = ? AND `cc` = ? ORDER BY servicedOn DESC");
    $stmt->bind_param("ss", $machineName, $cc);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function setServiced() {
    $conn = getDbConnection();
    $obj = getPostData();
    $id = (int)$obj->id;
    $ServiceOn = $obj->ServicedOn;

    $stmt = $conn->prepare("UPDATE `routine` SET `ServicedOn` = ? WHERE `id` = ?");
    $stmt->bind_param("si", $ServiceOn, $id);

    if ($stmt->execute()) {
        return json_encode(["Update successful"]);
    }
    return json_encode(["Update failed"]);
}

function insertService() {
    $conn = getDbConnection();
    $obj = getPostData();
    $cc = $obj->cc;
    $servicedOn = $obj->servicedOn;
    $serviceName = $obj->serviceName;
    $machineName = $obj->machineName;
    $amount = (float)$obj->Amount;
    $type = $obj->type;

    $stmt = $conn->prepare("INSERT INTO service(cc, servicedOn, serviceName, machineName, type, Amount) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("sssssd", $cc, $servicedOn, $serviceName, $machineName, $type, $amount);

    if ($stmt->execute()) {
        return json_encode(["Insertion successful"]);
    }
    return json_encode(["Insertion failed"]);
}

function updateTrans() {
    $conn = getDbConnection();
    $obj = getPostData();
    $client = $obj->client;
    $dateTime = $obj->dateTime;
    $labour = $obj->labour;
    $date = $obj->date;
    $month = $obj->month;
    $year = $obj->year;
    $cc = $obj->cc;
    $rate = (float)$obj->rate;
    $quantity = (int)$obj->quantity;
    $machineType = $obj->machineType;

    // Server-side authoritative pricing (see onCreateATransaction).
    $priced = priceTransaction($conn, $machineType, $obj->rate, $quantity);
    $rate = $priced['rate'];
    $total = $priced['total'];

    $stmt = $conn->prepare("UPDATE `transaction` SET `date` = ?, `client` = ?, `cc` = ?, `rate` = ?, `total` = ?, `labour` = ?, `quantity` = ?, `machineType` = ?, `month` = ?, `year` = ? WHERE `dateTime` = ?");
    $stmt->bind_param("sssddsissss", $date, $client, $cc, $rate, $total, $labour, $quantity, $machineType, $month, $year, $dateTime);

    if ($stmt->execute()) {
        return json_encode(["Update successful"]);
    }
    return json_encode(["Update failed"]);
}

function onCreateLabor() {
    $conn = getDbConnection();
    $obj = getPostData();
    $Labor = $obj->Labor;
    $id = $obj->id;

    $stmt = $conn->prepare("INSERT INTO masterlabor(id, Labor) VALUES (?, ?)");
    $stmt->bind_param("ss", $id, $Labor);

    if ($stmt->execute()) {
        return json_encode(["Insertion successful"]);
    }
    return json_encode(["Insertion failed"]);
}

function onUpdateClient() {
    $conn = getDbConnection();
    $obj = getPostData();
    $Client = $obj->client;
    $NewName = $obj->newname;

    $conn->begin_transaction();

    $stmt1 = $conn->prepare("UPDATE `masterclient` SET `client` = ? WHERE `client` = ?");
    $stmt1->bind_param("ss", $NewName, $Client);

    if (!$stmt1->execute()) {
        $conn->rollback();
        return json_encode(["Master update failed"]);
    }

    $stmt2 = $conn->prepare("UPDATE `transaction` SET `client` = ? WHERE `client` = ?");
    $stmt2->bind_param("ss", $NewName, $Client);

    if (!$stmt2->execute()) {
        $conn->rollback();
        return json_encode(["Transaction update failed"]);
    }

    $conn->commit();
    return json_encode(["Update successful"]);
}

function onCreateClient() {
    $conn = getDbConnection();
    $obj = getPostData();
    $id = $obj->id;
    $Client = $obj->Client;

    $stmt = $conn->prepare("INSERT INTO masterclient(id, client) VALUES (?, ?)");
    $stmt->bind_param("ss", $id, $Client);

    if ($stmt->execute()) {
        return json_encode(["Insertion successful"]);
    }
    return json_encode(["Insertion failed"]);
}

function onCreateATransaction() {
    $conn = getDbConnection();
    $obj = getPostData();
    $client = $obj->client;
    $labour = $obj->labour;
    $date = $obj->date;
    $month = $obj->month;
    $year = $obj->year;
    $cc = $obj->cc;
    $rate = (float)$obj->rate;
    $quantity = (int)$obj->quantity;
    $machineType = $obj->machineType;

    // Server-side authoritative pricing: for configured machine types (Softening,
    // Milling, ...) rate & total are derived from rate_config, so a wrong value
    // sent by the client can never be stored.
    $priced = priceTransaction($conn, $machineType, $obj->rate, $quantity);
    $rate = $priced['rate'];
    $total = $priced['total'];

    $stmt = $conn->prepare("INSERT INTO transaction(date, client, labour, cc, rate, quantity, machineType, total, month, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("ssssdisdss", $date, $client, $labour, $cc, $rate, $quantity, $machineType, $total, $month, $year);

    if ($stmt->execute()) {
        return json_encode(["Insertion successful"]);
    }
    return json_encode(["Insertion failed"]);
}

function getKhazana() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = $obj->month;
    $year = $obj->year;

    $stmt = $conn->prepare("SELECT * FROM khazana WHERE month = ? AND year = ? ORDER BY `year` ASC, `month` ASC");
    $stmt->bind_param("ss", $month, $year);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getLabourAnalytics() {
    $conn = getDbConnection();
    $obj = getPostData();
    $labour = $obj->labour;

    $stmt = $conn->prepare("SELECT * FROM transaction WHERE labour = ? ORDER BY `year` ASC, `month` ASC, `date` ASC");
    $stmt->bind_param("s", $labour);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function getProfitLoss() {
    $conn = getDbConnection();
    $result = @$conn->query("SELECT * FROM profit_loss ORDER BY `year` DESC, `month` DESC");
    if (!$result) {
        // Table likely missing
        return json_encode([]);
    }
    if ($result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function insertProfitLoss() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = $obj->month;
    $year = $obj->year;
    $shaving = (float)($obj->shaving ?? 0);
    $buffing = (float)($obj->buffing ?? 0);
    $charbi = (float)($obj->charbi ?? 0);
    $milling = (float)($obj->milling ?? 0);
    $tangan = (float)($obj->tangan ?? 0);
    $electricBill = (float)($obj->electricBill ?? 0);
    $munshi = (float)($obj->munshi ?? 0);
    $churi = (float)($obj->churi ?? 0);
    $mobil = (float)($obj->mobil ?? 0);
    $buffPaper = (float)($obj->buffPaper ?? 0);
    $bhussi = (float)($obj->bhussi ?? 0);
    $maintenance = (float)($obj->maintenance ?? 0);
    $vBelt = (float)($obj->vBelt ?? 0);
    $miscellaneous = (float)($obj->miscellaneous ?? 0);

    $stmt = @$conn->prepare(
        "INSERT INTO profit_loss (month, year, shaving, buffing, charbi, milling, tangan, electric_bill, munshi, churi, mobil, buff_paper, bhussi, maintenance, v_belt, miscellaneous)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            shaving = VALUES(shaving), buffing = VALUES(buffing), charbi = VALUES(charbi),
            milling = VALUES(milling), tangan = VALUES(tangan), electric_bill = VALUES(electric_bill),
            munshi = VALUES(munshi), churi = VALUES(churi), mobil = VALUES(mobil),
            buff_paper = VALUES(buff_paper), bhussi = VALUES(bhussi), maintenance = VALUES(maintenance),
            v_belt = VALUES(v_belt), miscellaneous = VALUES(miscellaneous)"
    );
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'profit_loss' does not exist. Please create it in the database."]);
    }
    $stmt->bind_param("ssdddddddddddddd",
        $month, $year, $shaving, $buffing, $charbi, $milling, $tangan,
        $electricBill, $munshi, $churi, $mobil, $buffPaper, $bhussi, $maintenance, $vBelt, $miscellaneous
    );

    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed"]);
}

// --- Machine master & machine expenses ---

/**
 * Offices to offer when creating a machine. Taken from the transaction data so
 * the list stays in sync with the rest of the app (Factory 01-04, Main ...).
 */
function getOffices() {
    $conn = getDbConnection();
    $result = $conn->query("SELECT DISTINCT `cc` FROM `transaction` WHERE `cc` <> '' ORDER BY `cc` ASC");
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

/**
 * Machine master enriched with expense totals, so the list page can be filtered
 * and sorted on spend without a second round trip.
 */
function getMachines() {
    $conn = getDbConnection();
    $result = $conn->query(
        "SELECT m.id, m.cc, m.machineName, m.type, m.createdOn, m.active,
                COUNT(s.dateTime) AS expenseCount,
                COALESCE(SUM(s.Amount), 0) AS totalAmount,
                MIN(s.servicedOn) AS firstServicedOn,
                MAX(s.servicedOn) AS lastServicedOn
         FROM `machine` m
         LEFT JOIN `service` s ON s.cc = m.cc AND s.machineName = m.machineName
         GROUP BY m.id, m.cc, m.machineName, m.type, m.createdOn, m.active
         ORDER BY m.cc ASC, m.machineName ASC"
    );
    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

function createMachine() {
    $conn = getDbConnection();
    $obj = getPostData();
    $cc = trim($obj->cc ?? '');
    $machineName = trim($obj->machineName ?? '');
    $type = trim($obj->type ?? '');

    if ($cc === '' || $machineName === '' || $type === '') {
        return json_encode(["status" => "failed", "error" => "Office, machine name and type are required"]);
    }

    $stmt = $conn->prepare("SELECT `id` FROM `machine` WHERE `cc` = ? AND `machineName` = ?");
    $stmt->bind_param("ss", $cc, $machineName);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        return json_encode(["status" => "failed", "error" => "'" . $machineName . "' already exists in " . $cc]);
    }

    $stmt = $conn->prepare("INSERT INTO `machine` (`cc`, `machineName`, `type`, `createdOn`, `active`) VALUES (?, ?, ?, CURDATE(), 1)");
    $stmt->bind_param("sss", $cc, $machineName, $type);

    if ($stmt->execute()) {
        return json_encode(["status" => "success", "id" => $conn->insert_id]);
    }
    return json_encode(["status" => "failed", "error" => "Could not create machine"]);
}

function getMachineExpenses() {
    $conn = getDbConnection();
    $obj = getPostData();
    $cc = $obj->cc ?? '';
    $machineName = $obj->machineName ?? '';

    $stmt = $conn->prepare(
        "SELECT `dateTime`, `cc`, `machineName`, `type`, `servicedOn`, `serviceName`, `Amount`
         FROM `service`
         WHERE `cc` = ? AND `machineName` = ?
         ORDER BY `servicedOn` DESC"
    );
    $stmt->bind_param("ss", $cc, $machineName);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

/**
 * Records one expense against a machine. The machine type is taken from the
 * master rather than the client, so it cannot drift per expense row.
 */
function insertMachineExpense() {
    $conn = getDbConnection();
    $obj = getPostData();
    $cc = trim($obj->cc ?? '');
    $machineName = trim($obj->machineName ?? '');
    $serviceName = trim($obj->serviceName ?? '');
    $servicedOn = $obj->servicedOn ?? '';
    $amount = (float)($obj->Amount ?? 0);

    if ($cc === '' || $machineName === '' || $serviceName === '' || $servicedOn === '') {
        return json_encode(["status" => "failed", "error" => "Service name and date are required"]);
    }

    $stmt = $conn->prepare("SELECT `type` FROM `machine` WHERE `cc` = ? AND `machineName` = ?");
    $stmt->bind_param("ss", $cc, $machineName);
    $stmt->execute();
    $machine = $stmt->get_result()->fetch_assoc();
    if (!$machine) {
        return json_encode(["status" => "failed", "error" => "Unknown machine"]);
    }
    $type = $machine["type"];

    $stmt = $conn->prepare(
        "INSERT INTO `service` (`cc`, `servicedOn`, `serviceName`, `machineName`, `type`, `Amount`)
         VALUES (?, ?, ?, ?, ?, ?)"
    );
    $stmt->bind_param("sssssd", $cc, $servicedOn, $serviceName, $machineName, $type, $amount);

    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed", "error" => "Could not save expense"]);
}

/**
 * Machine-wise expense totals for a date range, driving the report bar chart.
 * Machines without expenses in the range are left out.
 */
function getMachineExpenseReport() {
    $conn = getDbConnection();
    $obj = getPostData();
    $fromDate = $obj->fromDate ?? '';
    $toDate = $obj->toDate ?? '';
    $cc = trim($obj->cc ?? '');
    $type = trim($obj->type ?? '');

    if ($fromDate === '' || $toDate === '') {
        return json_encode([]);
    }

    $sql = "SELECT s.cc, s.machineName, s.type,
                   COUNT(*) AS expenseCount,
                   COALESCE(SUM(s.Amount), 0) AS totalAmount,
                   MIN(s.servicedOn) AS firstServicedOn,
                   MAX(s.servicedOn) AS lastServicedOn
            FROM `service` s
            WHERE s.servicedOn BETWEEN ? AND ?";
    $types = "ss";
    $params = [$fromDate, $toDate];

    if ($cc !== '') {
        $sql .= " AND s.cc = ?";
        $types .= "s";
        $params[] = $cc;
    }
    if ($type !== '') {
        $sql .= " AND s.type = ?";
        $types .= "s";
        $params[] = $type;
    }
    $sql .= " GROUP BY s.cc, s.machineName, s.type ORDER BY totalAmount DESC";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $result->num_rows > 0) {
        return json_encode(fetchAll($result));
    }
    return json_encode([]);
}

// --- Rate config ---

function getRates() {
    $conn = getDbConnection();
    $result = @$conn->query("SELECT machineType, rate, base, free_qty FROM rate_config ORDER BY machineType ASC");
    if (!$result) {
        return json_encode([]);
    }
    return json_encode(fetchAll($result));
}

function updateRate() {
    $conn = getDbConnection();
    $obj = getPostData();
    $machineType = $obj->machineType;
    $rate = (float)($obj->rate ?? 0);
    $base = (float)($obj->base ?? 0);
    $freeQty = (float)($obj->free_qty ?? 0);

    $stmt = @$conn->prepare(
        "INSERT INTO rate_config (machineType, rate, base, free_qty) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE rate = VALUES(rate), base = VALUES(base), free_qty = VALUES(free_qty)"
    );
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'rate_config' does not exist."]);
    }
    $stmt->bind_param("sddd", $machineType, $rate, $base, $freeQty);

    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed"]);
}

// --- Notices printed on client invoices ---

/**
 * The master switch plus every notice with its client list. An empty `clients`
 * array means the notice is global and applies to every client's invoice.
 * With `enabled` = 0 nothing is printed regardless of the notices themselves.
 */
function getNotices() {
    $conn = getDbConnection();

    $enabled = 1;
    $setting = @$conn->query("SELECT enabled FROM notice_setting WHERE id = 1");
    if ($setting && ($row = $setting->fetch_assoc())) {
        $enabled = (int)$row["enabled"];
    }

    $result = @$conn->query("SELECT id, notice, active, createdOn FROM notice ORDER BY id DESC");
    if (!$result) {
        // Table likely missing
        return json_encode(["enabled" => $enabled, "notices" => []]);
    }

    $notices = [];
    while ($row = $result->fetch_assoc()) {
        $row["id"] = (int)$row["id"];
        $row["active"] = (int)$row["active"];
        $row["clients"] = [];
        $notices[$row["id"]] = $row;
    }
    if (!$notices) {
        return json_encode(["enabled" => $enabled, "notices" => []]);
    }

    $mapping = @$conn->query("SELECT notice_id, client FROM notice_client ORDER BY client ASC");
    if ($mapping) {
        while ($row = $mapping->fetch_assoc()) {
            $id = (int)$row["notice_id"];
            if (isset($notices[$id])) {
                $notices[$id]["clients"][] = $row["client"];
            }
        }
    }

    return json_encode(["enabled" => $enabled, "notices" => array_values($notices)]);
}

/**
 * Flips the master switch that decides whether notices are printed at all.
 */
function setNoticesEnabled() {
    $conn = getDbConnection();
    $obj = getPostData();
    $enabled = !empty($obj->enabled) ? 1 : 0;

    $stmt = @$conn->prepare(
        "INSERT INTO `notice_setting` (`id`, `enabled`) VALUES (1, ?)
         ON DUPLICATE KEY UPDATE `enabled` = VALUES(`enabled`)"
    );
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'notice_setting' does not exist. Please run sql/notice.sql."]);
    }
    $stmt->bind_param("i", $enabled);

    if ($stmt->execute()) {
        return json_encode(["status" => "success", "enabled" => $enabled]);
    }
    return json_encode(["status" => "failed", "error" => "Could not update the notice setting"]);
}

/**
 * Creates a notice when `id` is missing, otherwise updates it. The client list
 * is always replaced wholesale, so removing every client turns the notice into
 * a global one.
 */
function saveNotice() {
    $conn = getDbConnection();
    $obj = getPostData();
    $id = isset($obj->id) && $obj->id !== "" ? (int)$obj->id : 0;
    $notice = trim($obj->notice ?? '');
    $active = !empty($obj->active) ? 1 : 0;
    $clients = isset($obj->clients) && is_array($obj->clients) ? $obj->clients : [];

    if ($notice === '') {
        return json_encode(["status" => "failed", "error" => "Notice text is required"]);
    }

    $conn->begin_transaction();

    if ($id > 0) {
        $stmt = @$conn->prepare("UPDATE `notice` SET `notice` = ?, `active` = ? WHERE `id` = ?");
        if (!$stmt) {
            $conn->rollback();
            return json_encode(["status" => "failed", "error" => "Table 'notice' does not exist. Please run sql/notice.sql."]);
        }
        $stmt->bind_param("sii", $notice, $active, $id);
        if (!$stmt->execute()) {
            $conn->rollback();
            return json_encode(["status" => "failed", "error" => "Could not update notice"]);
        }

        $stmt = $conn->prepare("DELETE FROM `notice_client` WHERE `notice_id` = ?");
        $stmt->bind_param("i", $id);
        if (!$stmt->execute()) {
            $conn->rollback();
            return json_encode(["status" => "failed", "error" => "Could not update notice clients"]);
        }
    } else {
        $stmt = @$conn->prepare("INSERT INTO `notice` (`notice`, `active`, `createdOn`) VALUES (?, ?, CURDATE())");
        if (!$stmt) {
            $conn->rollback();
            return json_encode(["status" => "failed", "error" => "Table 'notice' does not exist. Please run sql/notice.sql."]);
        }
        $stmt->bind_param("si", $notice, $active);
        if (!$stmt->execute()) {
            $conn->rollback();
            return json_encode(["status" => "failed", "error" => "Could not create notice"]);
        }
        $id = $conn->insert_id;
    }

    if ($clients) {
        $stmt = $conn->prepare("INSERT IGNORE INTO `notice_client` (`notice_id`, `client`) VALUES (?, ?)");
        foreach ($clients as $client) {
            $client = trim((string)$client);
            if ($client === '') {
                continue;
            }
            $stmt->bind_param("is", $id, $client);
            if (!$stmt->execute()) {
                $conn->rollback();
                return json_encode(["status" => "failed", "error" => "Could not save notice clients"]);
            }
        }
    }

    $conn->commit();
    return json_encode(["status" => "success", "id" => $id]);
}

// --- Daily Khata (day book) ---
//
// Machine expenses are stored in `service`, not in `daily_khata`, so one
// expense is one row no matter which screen records it. Everything below
// therefore reads debits from both tables.

// Credit categories need a client only for 'client_payment'.
function khataCategories() {
    return [
        "credit" => ["client_payment", "thaktha_bhara", "other"],
        "debit" => ["churi", "buff_paper", "mobil", "bhussi", "v_belt", "other"],
    ];
}

// The one-time cash-in-hand the day book starts from.
function khataOpeningRow($conn) {
    $result = @$conn->query("SELECT opening_date, amount FROM khata_opening WHERE id = 1");
    if ($result && ($row = $result->fetch_assoc())) {
        return ["opening_date" => $row["opening_date"], "amount" => (float)$row["amount"]];
    }
    return ["opening_date" => null, "amount" => 0.0];
}

/**
 * Net movement (credits - debits) strictly before $date, so a day's opening
 * balance is always derived rather than stored. Entries dated before the
 * opening date are ignored: the opening figure already accounts for them.
 */
function khataNetBefore($conn, $date, $openingDate) {
    $net = 0.0;

    $sql = "SELECT direction, COALESCE(SUM(amount), 0) AS total FROM daily_khata WHERE entry_date < ?";
    $params = [$date];
    $types = "s";
    if ($openingDate) {
        $sql .= " AND entry_date >= ?";
        $params[] = $openingDate;
        $types .= "s";
    }
    $sql .= " GROUP BY direction";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $net += ($row["direction"] === "credit" ? 1 : -1) * (float)$row["total"];
    }

    // Machine expenses are debits too.
    $sql = "SELECT COALESCE(SUM(Amount), 0) AS total FROM service WHERE servicedOn < ?";
    $params = [$date];
    $types = "s";
    if ($openingDate) {
        $sql .= " AND servicedOn >= ?";
        $params[] = $openingDate;
        $types .= "s";
    }
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $net -= (float)$row["total"];

    return $net;
}

/**
 * One day of the book: what was carried in, that day's credits and debits, and
 * the closing balance that carries to the next day.
 */
function getDailyKhata() {
    $conn = getDbConnection();
    $obj = getPostData();
    $date = $obj->date ?? '';

    if ($date === '') {
        return json_encode(["status" => "failed", "error" => "Date is required"]);
    }

    $opening = @$conn->query("SHOW TABLES LIKE 'daily_khata'");
    if (!$opening || $opening->num_rows === 0) {
        return json_encode(["status" => "failed", "error" => "Table 'daily_khata' does not exist. Please run sql/daily_khata.sql."]);
    }

    $openingRow = khataOpeningRow($conn);
    $carried = $openingRow["amount"] + khataNetBefore($conn, $date, $openingRow["opening_date"]);

    $credits = [];
    $debits = [];

    $stmt = $conn->prepare(
        "SELECT id, direction, category, client, note, amount
         FROM daily_khata WHERE entry_date = ? ORDER BY id ASC"
    );
    $stmt->bind_param("s", $date);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $entry = [
            "id" => (int)$row["id"],
            "source" => "khata",
            "category" => $row["category"],
            "client" => $row["client"],
            "note" => $row["note"],
            "amount" => (float)$row["amount"],
            "cc" => "",
            "machineName" => "",
        ];
        if ($row["direction"] === "credit") {
            $credits[] = $entry;
        } else {
            $debits[] = $entry;
        }
    }

    // That day's machine expenses, read straight from the Machine Expenses data.
    $stmt = $conn->prepare(
        "SELECT dateTime, cc, machineName, serviceName, Amount
         FROM service WHERE servicedOn = ? ORDER BY dateTime ASC"
    );
    $stmt->bind_param("s", $date);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $debits[] = [
            "id" => 0,
            "source" => "service",
            "serviceDt" => $row["dateTime"],
            "category" => "machine_expense",
            "client" => null,
            "note" => $row["serviceName"],
            "amount" => (float)$row["Amount"],
            "cc" => $row["cc"],
            "machineName" => $row["machineName"],
        ];
    }

    $totalCredit = 0.0;
    foreach ($credits as $c) { $totalCredit += $c["amount"]; }
    $totalDebit = 0.0;
    foreach ($debits as $d) { $totalDebit += $d["amount"]; }

    return json_encode([
        "status" => "success",
        "date" => $date,
        "openingDate" => $openingRow["opening_date"],
        "openingConfigured" => $openingRow["opening_date"] !== null,
        "carried" => $carried,
        "credits" => $credits,
        "debits" => $debits,
        "totalCredit" => $totalCredit,
        "totalDebit" => $totalDebit,
        "closing" => $carried + $totalCredit - $totalDebit,
    ]);
}

/**
 * Adds or updates one entry. A 'machine_expense' debit is written to `service`
 * so it also shows up in the Machine Expenses module; everything else goes to
 * `daily_khata`.
 */
function saveKhataEntry() {
    $conn = getDbConnection();
    $obj = getPostData();

    $date = $obj->entry_date ?? '';
    $direction = $obj->direction ?? '';
    $category = $obj->category ?? '';
    $note = trim($obj->note ?? '');
    $amount = (float)($obj->amount ?? 0);
    $client = trim($obj->client ?? '');
    $id = (int)($obj->id ?? 0);

    if ($date === '') {
        return json_encode(["status" => "failed", "error" => "Date is required"]);
    }
    $cats = khataCategories();
    if ($category === "machine_expense") {
        $direction = "debit";
    } elseif (!isset($cats[$direction]) || !in_array($category, $cats[$direction], true)) {
        return json_encode(["status" => "failed", "error" => "Unknown category for this direction"]);
    }
    if ($amount <= 0) {
        return json_encode(["status" => "failed", "error" => "Amount must be greater than zero"]);
    }
    if ($category === "client_payment" && $client === '') {
        return json_encode(["status" => "failed", "error" => "Select the client who paid"]);
    }

    if ($category === "machine_expense") {
        $cc = trim($obj->cc ?? '');
        $machineName = trim($obj->machineName ?? '');
        if ($cc === '' || $machineName === '') {
            return json_encode(["status" => "failed", "error" => "Select the office and machine"]);
        }
        if ($note === '') {
            return json_encode(["status" => "failed", "error" => "Enter what the machine expense was for"]);
        }

        $stmt = $conn->prepare("SELECT `type` FROM `machine` WHERE `cc` = ? AND `machineName` = ?");
        $stmt->bind_param("ss", $cc, $machineName);
        $stmt->execute();
        $machine = $stmt->get_result()->fetch_assoc();
        if (!$machine) {
            return json_encode(["status" => "failed", "error" => "Unknown machine"]);
        }
        $type = $machine["type"];

        $serviceDt = trim($obj->serviceDt ?? '');
        if ($serviceDt !== '') {
            $stmt = $conn->prepare(
                "UPDATE `service` SET `cc` = ?, `machineName` = ?, `type` = ?, `servicedOn` = ?,
                 `serviceName` = ?, `Amount` = ? WHERE `dateTime` = ?"
            );
            $stmt->bind_param("sssssds", $cc, $machineName, $type, $date, $note, $amount, $serviceDt);
        } else {
            $stmt = $conn->prepare(
                "INSERT INTO `service` (`cc`, `servicedOn`, `serviceName`, `machineName`, `type`, `Amount`)
                 VALUES (?, ?, ?, ?, ?, ?)"
            );
            $stmt->bind_param("sssssd", $cc, $date, $note, $machineName, $type, $amount);
        }

        if ($stmt->execute()) {
            return json_encode(["status" => "success"]);
        }
        return json_encode(["status" => "failed", "error" => "Could not save the machine expense"]);
    }

    $clientValue = $category === "client_payment" ? $client : null;

    if ($id > 0) {
        $stmt = @$conn->prepare(
            "UPDATE `daily_khata` SET `entry_date` = ?, `direction` = ?, `category` = ?,
             `client` = ?, `note` = ?, `amount` = ? WHERE `id` = ?"
        );
        if (!$stmt) {
            return json_encode(["status" => "failed", "error" => "Table 'daily_khata' does not exist. Please run sql/daily_khata.sql."]);
        }
        $stmt->bind_param("sssssdi", $date, $direction, $category, $clientValue, $note, $amount, $id);
    } else {
        $stmt = @$conn->prepare(
            "INSERT INTO `daily_khata` (`entry_date`, `direction`, `category`, `client`, `note`, `amount`)
             VALUES (?, ?, ?, ?, ?, ?)"
        );
        if (!$stmt) {
            return json_encode(["status" => "failed", "error" => "Table 'daily_khata' does not exist. Please run sql/daily_khata.sql."]);
        }
        $stmt->bind_param("sssssd", $date, $direction, $category, $clientValue, $note, $amount);
    }

    if ($stmt->execute()) {
        return json_encode(["status" => "success", "id" => $id > 0 ? $id : $conn->insert_id]);
    }
    return json_encode(["status" => "failed", "error" => "Could not save the entry"]);
}

function deleteKhataEntry() {
    $conn = getDbConnection();
    $obj = getPostData();
    $source = $obj->source ?? 'khata';

    if ($source === "service") {
        $serviceDt = trim($obj->serviceDt ?? '');
        if ($serviceDt === '') {
            return json_encode(["status" => "failed", "error" => "Missing machine expense reference"]);
        }
        $stmt = $conn->prepare("DELETE FROM `service` WHERE `dateTime` = ?");
        $stmt->bind_param("s", $serviceDt);
        if ($stmt->execute()) {
            return json_encode(["status" => "success"]);
        }
        return json_encode(["status" => "failed", "error" => "Could not delete the machine expense"]);
    }

    $id = (int)($obj->id ?? 0);
    if ($id <= 0) {
        return json_encode(["status" => "failed", "error" => "Entry id is required"]);
    }
    $stmt = @$conn->prepare("DELETE FROM `daily_khata` WHERE `id` = ?");
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'daily_khata' does not exist. Please run sql/daily_khata.sql."]);
    }
    $stmt->bind_param("i", $id);
    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed", "error" => "Could not delete the entry"]);
}

function getKhataOpening() {
    $conn = getDbConnection();
    $row = khataOpeningRow($conn);
    return json_encode([
        "status" => "success",
        "opening_date" => $row["opening_date"],
        "amount" => $row["amount"],
        "configured" => $row["opening_date"] !== null,
    ]);
}

function setKhataOpening() {
    $conn = getDbConnection();
    $obj = getPostData();
    $date = $obj->opening_date ?? '';
    $amount = (float)($obj->amount ?? 0);

    if ($date === '') {
        return json_encode(["status" => "failed", "error" => "Opening date is required"]);
    }

    $stmt = @$conn->prepare(
        "INSERT INTO `khata_opening` (`id`, `opening_date`, `amount`) VALUES (1, ?, ?)
         ON DUPLICATE KEY UPDATE `opening_date` = VALUES(`opening_date`), `amount` = VALUES(`amount`)"
    );
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'khata_opening' does not exist. Please run sql/daily_khata.sql."]);
    }
    $stmt->bind_param("sd", $date, $amount);
    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed", "error" => "Could not save the opening balance"]);
}

/** Every client in the master, with the opening balance recorded so far. */
function getClientOpenings() {
    $conn = getDbConnection();
    $openings = [];
    $result = @$conn->query("SELECT client, amount, as_of_date FROM client_opening");
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $openings[strtolower(trim($row["client"]))] = [
                "amount" => (float)$row["amount"],
                "as_of_date" => $row["as_of_date"],
            ];
        }
    }

    $rows = [];
    $result = $conn->query("SELECT client FROM masterclient ORDER BY client ASC");
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $key = strtolower(trim($row["client"]));
            $rows[] = [
                "client" => $row["client"],
                "amount" => isset($openings[$key]) ? $openings[$key]["amount"] : 0,
                "as_of_date" => isset($openings[$key]) ? $openings[$key]["as_of_date"] : null,
            ];
        }
    }
    return json_encode(["status" => "success", "rows" => $rows]);
}

/** Saves the whole opening-balance sheet in one round trip. */
function saveClientOpenings() {
    $conn = getDbConnection();
    $obj = getPostData();
    $rows = isset($obj->rows) && is_array($obj->rows) ? $obj->rows : [];
    $asOf = $obj->as_of_date ?? null;

    if (!$rows) {
        return json_encode(["status" => "failed", "error" => "Nothing to save"]);
    }

    $stmt = @$conn->prepare(
        "INSERT INTO `client_opening` (`client`, `amount`, `as_of_date`) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE `amount` = VALUES(`amount`), `as_of_date` = VALUES(`as_of_date`)"
    );
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'client_opening' does not exist. Please run sql/daily_khata.sql."]);
    }

    // The whole sheet is written, zeros included. Skipping them would leave a
    // cleared figure lingering at its old amount, and would lose the as-of date
    // entirely on a sheet where every client happens to be square.
    $conn->begin_transaction();
    $saved = 0;
    foreach ($rows as $row) {
        $client = trim($row->client ?? '');
        if ($client === '') {
            continue;
        }
        $amount = (float)($row->amount ?? 0);
        $stmt->bind_param("sds", $client, $amount, $asOf);
        if (!$stmt->execute()) {
            $conn->rollback();
            return json_encode(["status" => "failed", "error" => "Could not save opening balances"]);
        }
        $saved++;
    }
    $conn->commit();

    return json_encode(["status" => "success", "saved" => $saved]);
}

/**
 * Opening balances keyed by lowercased client name. `cutoff` is the period
 * (YYYYMM) the opening figure was taken at: anything billed before it is
 * already inside the opening amount and must not be counted again. A client
 * with no opening row falls back to clientOpeningCutoff(), so they start at
 * zero on the same date rather than dragging their whole history in.
 */
function clientOpeningMap($conn) {
    $map = [];
    $result = @$conn->query("SELECT client, amount, as_of_date FROM client_opening");
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $cutoff = 0;
            if (!empty($row["as_of_date"])) {
                $ts = strtotime($row["as_of_date"]);
                $cutoff = (int)date("Y", $ts) * 100 + (int)date("n", $ts);
            }
            $map[strtolower(trim($row["client"]))] = [
                "client" => trim($row["client"]),
                "amount" => (float)$row["amount"],
                "cutoff" => $cutoff,
                "as_of_date" => $row["as_of_date"],
            ];
        }
    }
    return $map;
}

/**
 * The period (YYYYMM) the opening-balance sheet was last drawn up at.
 *
 * Opening balances are maintained for every client at once against a single
 * as-of date, so this is the line the books were drawn under. A client added
 * after that sheet was saved has no row of their own, and starts fresh from
 * this same date - the app must not quietly rebuild an OD for them out of
 * their whole billing history.
 *
 * Returns 0 when no opening balances have been maintained at all, which keeps
 * a brand new install showing the full history until the sheet is filled in.
 */
function clientOpeningCutoff($conn) {
    $result = @$conn->query("SELECT MAX(as_of_date) AS as_of FROM client_opening");
    if ($result) {
        $row = $result->fetch_assoc();
        if (!empty($row["as_of"])) {
            $ts = strtotime($row["as_of"]);
            return (int)date("Y", $ts) * 100 + (int)date("n", $ts);
        }
    }
    return 0;
}

/**
 * Per-client dues for a month. OD is what was owed going into the month:
 * opening balance + everything billed since the opening cut-off but before
 * this month - every payment received in that same window. The month's own
 * charges stay in `billed`, so OD + billed never double counts.
 *
 * Thokai is left out of `billed` because it is left out of the invoice too.
 */
function getClientBalances() {
    $obj = getPostData();
    $month = (int)($obj->month ?? 0);
    $year = (int)($obj->year ?? 0);

    if ($month < 1 || $month > 12 || $year < 2000) {
        return json_encode(["status" => "failed", "error" => "Valid month and year are required"]);
    }

    return json_encode([
        "status" => "success",
        "month" => $month,
        "year" => $year,
        "rows" => clientBalanceRows(getDbConnection(), $month, $year),
    ]);
}

/**
 * The rows behind getClientBalances(), taking the period as arguments so the
 * Tagada Slip can reuse the exact same OD and payment figures instead of
 * working them out a second way.
 */
function clientBalanceRows($conn, $month, $year) {
    $selected = $year * 100 + $month;

    $openings = clientOpeningMap($conn);
    $defaultCutoff = clientOpeningCutoff($conn);

    $byClient = [];
    $touch = function (&$byClient, $name) use ($openings, $defaultCutoff) {
        $key = strtolower(trim($name));
        if ($key === '') {
            return null;
        }
        if (!isset($byClient[$key])) {
            $byClient[$key] = [
                "client" => trim($name),
                "opening" => isset($openings[$key]) ? $openings[$key]["amount"] : 0.0,
                "cutoff" => isset($openings[$key]) ? $openings[$key]["cutoff"] : $defaultCutoff,
                "billedBefore" => 0.0,
                "paidBefore" => 0.0,
                "billed" => 0.0,
                "paid" => 0.0,
            ];
        }
        return $key;
    };

    foreach ($openings as $key => $o) {
        $touch($byClient, $o["client"]);
    }

    // Grouped by period so each client's own cut-off can be applied.
    $result = $conn->query(
        "SELECT client, year, month, COALESCE(SUM(total), 0) AS billed
         FROM transaction
         WHERE machineType <> 'Thokai' AND client IS NOT NULL AND client <> ''
         GROUP BY client, year, month"
    );
    while ($row = $result->fetch_assoc()) {
        $key = $touch($byClient, $row["client"]);
        if (!$key) {
            continue;
        }
        $period = (int)$row["year"] * 100 + (int)$row["month"];
        if ($period > $selected) {
            continue;
        }
        if ($period === $selected) {
            // The month being looked at always reports its own billing, even
            // when it falls before the opening cut-off - the cut-off decides
            // what rolls into OD, not whether the month itself is visible.
            $byClient[$key]["billed"] += (float)$row["billed"];
        } elseif ($period >= $byClient[$key]["cutoff"]) {
            $byClient[$key]["billedBefore"] += (float)$row["billed"];
        }
    }

    $stmt = @$conn->prepare(
        "SELECT client, entry_date, COALESCE(SUM(amount), 0) AS paid
         FROM daily_khata
         WHERE direction = 'credit' AND category = 'client_payment'
           AND client IS NOT NULL AND client <> ''
         GROUP BY client, entry_date"
    );
    if ($stmt) {
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $key = $touch($byClient, $row["client"]);
            if (!$key) {
                continue;
            }
            $ts = strtotime($row["entry_date"]);
            $period = (int)date("Y", $ts) * 100 + (int)date("n", $ts);
            if ($period > $selected) {
                continue;
            }
            if ($period === $selected) {
                $byClient[$key]["paid"] += (float)$row["paid"];
            } elseif ($period >= $byClient[$key]["cutoff"]) {
                $byClient[$key]["paidBefore"] += (float)$row["paid"];
            }
        }
    }

    $rows = [];
    foreach ($byClient as $entry) {
        // On a month earlier than the cut-off the opening figure has not been
        // struck yet, and pre-cut-off dues are deliberately not rebuilt from
        // history, so that month simply stands on its own.
        $opening = $selected >= $entry["cutoff"] ? $entry["opening"] : 0.0;
        $od = $opening + $entry["billedBefore"] - $entry["paidBefore"];
        $entry["od"] = $od;
        $entry["balance"] = $od + $entry["billed"] - $entry["paid"];
        $rows[] = $entry;
    }
    usort($rows, function ($a, $b) {
        return strcasecmp($a["client"], $b["client"]);
    });

    return $rows;
}

/**
 * Everything the Tagada Slip needs for a month, in one round trip.
 *
 * Returns the month's billing split by client and factory, alongside each
 * client's OD and the money received during the month. OD and payments are
 * held per client and cannot be traced to a factory, so they come back once
 * per client and the caller decides where to show them.
 *
 * The slip previously made one request per client on top of a client list,
 * which meant dozens of round trips to draw a single month.
 *
 * Thokai is excluded so the slip agrees with the invoice and the ledger.
 */
function getTagadaSlip() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = (int)($obj->month ?? 0);
    $year = (int)($obj->year ?? 0);

    if ($month < 1 || $month > 12 || $year < 2000) {
        return json_encode(["status" => "failed", "error" => "Valid month and year are required"]);
    }
    $sMonth = sprintf("%02d", $month);
    $sYear = (string)$year;

    $billing = [];
    $stmt = $conn->prepare(
        "SELECT client, cc, COALESCE(SUM(total), 0) AS current
         FROM transaction
         WHERE month = ? AND year = ? AND machineType <> 'Thokai'
           AND client IS NOT NULL AND client <> '' AND cc <> ''
         GROUP BY client, cc
         ORDER BY client ASC, cc ASC"
    );
    $stmt->bind_param("ss", $sMonth, $sYear);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $billing[] = [
            "client" => trim($row["client"]),
            "cc" => trim($row["cc"]),
            "current" => (float)$row["current"],
        ];
    }

    // Same figures the Client Ledger shows, so the two can never disagree.
    $balances = [];
    foreach (clientBalanceRows($conn, $month, $year) as $row) {
        if ($row["od"] == 0.0 && $row["paid"] == 0.0) {
            continue;
        }
        $balances[] = [
            "client" => $row["client"],
            "od" => $row["od"],
            "paid" => $row["paid"],
        ];
    }

    return json_encode([
        "status" => "success",
        "month" => $month,
        "year" => $year,
        "billing" => $billing,
        "balances" => $balances,
    ]);
}

/**
 * One month's statement for one client: what was owed going into the month
 * (OD), what was billed and paid during it, the closing balance, and the
 * payments received up to and including that month.
 *
 * OD is worked out exactly the way getClientBalances() does it, so the One
 * Client tab and the All Clients tab always agree on the same figure.
 */
function getClientLedger() {
    $conn = getDbConnection();
    $obj = getPostData();
    $client = trim($obj->client ?? '');
    $month = (int)($obj->month ?? 0);
    $year = (int)($obj->year ?? 0);

    if ($client === '') {
        return json_encode(["status" => "failed", "error" => "Client is required"]);
    }
    if ($month < 1 || $month > 12 || $year < 2000) {
        return json_encode(["status" => "failed", "error" => "Valid month and year are required"]);
    }
    $selected = $year * 100 + $month;

    $openings = clientOpeningMap($conn);
    $key = strtolower(trim($client));

    // No opening row means the balance was maintained as zero, so the ledger
    // still starts at the sheet's as-of date - it does not reopen the history.
    $opening = 0.0;
    $cutoff = clientOpeningCutoff($conn);
    if (isset($openings[$key])) {
        $opening = $openings[$key]["amount"];
        $cutoff = $openings[$key]["cutoff"];
    }

    // On a month earlier than the cut-off that opening figure has not been
    // struck yet, so it must not be applied to the month being looked at.
    if ($selected < $cutoff) {
        $opening = 0.0;
    }

    $billedBefore = 0.0;
    $paidBefore = 0.0;
    $billed = 0.0;
    $paid = 0.0;

    $stmt = $conn->prepare(
        "SELECT year, month, COALESCE(SUM(total), 0) AS billed
         FROM transaction
         WHERE client = ? AND machineType <> 'Thokai'
         GROUP BY year, month"
    );
    $stmt->bind_param("s", $client);
    $stmt->execute();
    $result = $stmt->get_result();
    while ($row = $result->fetch_assoc()) {
        $period = (int)$row["year"] * 100 + (int)$row["month"];
        if ($period > $selected) {
            continue;
        }
        if ($period === $selected) {
            // The month asked for always reports its own billing, cut-off or not.
            $billed += (float)$row["billed"];
        } elseif ($period >= $cutoff) {
            // Anything before the cut-off is already inside the opening figure.
            $billedBefore += (float)$row["billed"];
        }
    }

    $payments = [];
    $stmt = @$conn->prepare(
        "SELECT entry_date, note, amount
         FROM daily_khata
         WHERE direction = 'credit' AND category = 'client_payment' AND client = ?
         ORDER BY entry_date ASC, id ASC"
    );
    if ($stmt) {
        $stmt->bind_param("s", $client);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $ts = strtotime($row["entry_date"]);
            $period = (int)date("Y", $ts) * 100 + (int)date("n", $ts);
            if ($period > $selected) {
                continue;
            }
            if ($period === $selected) {
                $paid += (float)$row["amount"];
            } elseif ($period >= $cutoff) {
                $paidBefore += (float)$row["amount"];
            }
            // The history runs to the statement month and no further, so a
            // later payment can never make a past statement look settled.
            $payments[] = [
                "date" => $row["entry_date"],
                "note" => $row["note"],
                "amount" => (float)$row["amount"],
                "inMonth" => $period === $selected,
            ];
        }
    }

    $od = $opening + $billedBefore - $paidBefore;

    return json_encode([
        "status" => "success",
        "client" => $client,
        "month" => $month,
        "year" => $year,
        "opening" => $opening,
        "od" => $od,
        "billed" => $billed,
        "paid" => $paid,
        "balance" => $od + $billed - $paid,
        "payments" => $payments,
    ]);
}

/**
 * Debit totals per category for a month, used to pre-fill the monthly P&L.
 * Machine expenses come from `service` and land on the Maintenance line.
 */
function getKhataMonthlySummary() {
    $conn = getDbConnection();
    $obj = getPostData();
    $month = (int)($obj->month ?? 0);
    $year = (int)($obj->year ?? 0);

    if ($month < 1 || $month > 12 || $year < 2000) {
        return json_encode(["status" => "failed", "error" => "Valid month and year are required"]);
    }

    $debits = [];
    $credits = [];

    $stmt = @$conn->prepare(
        "SELECT direction, category, COALESCE(SUM(amount), 0) AS total
         FROM daily_khata
         WHERE YEAR(entry_date) = ? AND MONTH(entry_date) = ?
         GROUP BY direction, category"
    );
    if ($stmt) {
        $stmt->bind_param("ii", $year, $month);
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            if ($row["direction"] === "debit") {
                $debits[$row["category"]] = (float)$row["total"];
            } else {
                $credits[$row["category"]] = (float)$row["total"];
            }
        }
    }

    $stmt = $conn->prepare(
        "SELECT COALESCE(SUM(Amount), 0) AS total FROM service
         WHERE YEAR(servicedOn) = ? AND MONTH(servicedOn) = ?"
    );
    $stmt->bind_param("ii", $year, $month);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $debits["machine_expense"] = (float)$row["total"];

    // Every electricity bill raised for the month, across all meters.
    $debits["electricity"] = 0.0;
    $stmt = @$conn->prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM electricity_bill
         WHERE year = ? AND month = ?"
    );
    if ($stmt) {
        $stmt->bind_param("ii", $year, $month);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $debits["electricity"] = (float)$row["total"];
    }

    return json_encode([
        "status" => "success",
        "month" => $month,
        "year" => $year,
        "debits" => $debits,
        "credits" => $credits,
    ]);
}

// --- Electricity (a sub-module of Expenses) ---

// A meter sits at one of two places; anything else is rejected.
function electricityLocations() {
    return ["Factory", "Chowbaga"];
}

/** Every meter, with how many bills it has and what has been billed so far. */
function getElectricityMeters() {
    $conn = getDbConnection();
    $result = @$conn->query(
        "SELECT m.id, m.customer_id, m.meter_number, m.consumer_name, m.nickname, m.cc, m.active,
                COUNT(b.id) AS billCount,
                COALESCE(SUM(b.amount), 0) AS totalAmount
         FROM `electricity_meter` m
         LEFT JOIN `electricity_bill` b ON b.meter_id = m.id
         GROUP BY m.id, m.customer_id, m.meter_number, m.consumer_name, m.nickname, m.cc, m.active
         ORDER BY m.nickname ASC, m.consumer_name ASC"
    );
    if (!$result) {
        return json_encode([]);
    }
    return json_encode(fetchAll($result));
}

function saveElectricityMeter() {
    $conn = getDbConnection();
    $obj = getPostData();
    $id = (int)($obj->id ?? 0);
    $customerId = trim($obj->customer_id ?? '');
    $meterNumber = trim($obj->meter_number ?? '');
    $consumerName = trim($obj->consumer_name ?? '');
    $nickname = trim($obj->nickname ?? '');
    $cc = trim($obj->cc ?? '');
    $active = isset($obj->active) ? (!empty($obj->active) ? 1 : 0) : 1;

    if ($customerId === '' || $meterNumber === '' || $consumerName === '') {
        return json_encode(["status" => "failed", "error" => "Customer ID, meter number and consumer name are required"]);
    }
    if (!in_array($cc, electricityLocations(), true)) {
        return json_encode(["status" => "failed", "error" => "Select a location: " . implode(" or ", electricityLocations())]);
    }

    // Customer ID identifies the connection, so it must stay unique.
    $stmt = @$conn->prepare("SELECT `id` FROM `electricity_meter` WHERE `customer_id` = ? AND `id` <> ?");
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'electricity_meter' does not exist. Please run sql/electricity.sql."]);
    }
    $stmt->bind_param("si", $customerId, $id);
    $stmt->execute();
    if ($stmt->get_result()->num_rows > 0) {
        return json_encode(["status" => "failed", "error" => "Customer ID '" . $customerId . "' already exists"]);
    }

    if ($id > 0) {
        $stmt = $conn->prepare(
            "UPDATE `electricity_meter` SET `customer_id` = ?, `meter_number` = ?,
             `consumer_name` = ?, `nickname` = ?, `cc` = ?, `active` = ? WHERE `id` = ?"
        );
        $stmt->bind_param("sssssii", $customerId, $meterNumber, $consumerName, $nickname, $cc, $active, $id);
    } else {
        $stmt = $conn->prepare(
            "INSERT INTO `electricity_meter` (`customer_id`, `meter_number`, `consumer_name`, `nickname`, `cc`, `active`, `created_on`)
             VALUES (?, ?, ?, ?, ?, ?, CURDATE())"
        );
        $stmt->bind_param("sssssi", $customerId, $meterNumber, $consumerName, $nickname, $cc, $active);
    }

    if ($stmt->execute()) {
        return json_encode(["status" => "success", "id" => $id > 0 ? $id : $conn->insert_id]);
    }
    return json_encode(["status" => "failed", "error" => "Could not save the meter"]);
}

function deleteElectricityMeter() {
    $conn = getDbConnection();
    $obj = getPostData();
    $id = (int)($obj->id ?? 0);

    if ($id <= 0) {
        return json_encode(["status" => "failed", "error" => "Meter id is required"]);
    }
    // Its bills go with it via ON DELETE CASCADE.
    $stmt = @$conn->prepare("DELETE FROM `electricity_meter` WHERE `id` = ?");
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'electricity_meter' does not exist. Please run sql/electricity.sql."]);
    }
    $stmt->bind_param("i", $id);
    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed", "error" => "Could not delete the meter"]);
}

/**
 * Bills, optionally narrowed to one meter and/or one month. With no filter it
 * returns everything, newest period first.
 */
function getElectricityBills() {
    $conn = getDbConnection();
    $obj = getPostData();
    $meterId = (int)($obj->meter_id ?? 0);
    $month = (int)($obj->month ?? 0);
    $year = (int)($obj->year ?? 0);

    $sql = "SELECT b.id, b.meter_id, b.month, b.year, b.amount,
                   m.customer_id, m.meter_number, m.consumer_name, m.nickname, m.cc
            FROM `electricity_bill` b
            JOIN `electricity_meter` m ON m.id = b.meter_id";
    $conditions = [];
    $types = "";
    $params = [];

    if ($meterId > 0) {
        $conditions[] = "b.meter_id = ?";
        $types .= "i";
        $params[] = $meterId;
    }
    if ($month >= 1 && $month <= 12) {
        $conditions[] = "b.month = ?";
        $types .= "i";
        $params[] = $month;
    }
    if ($year > 2000) {
        $conditions[] = "b.year = ?";
        $types .= "i";
        $params[] = $year;
    }
    if ($conditions) {
        $sql .= " WHERE " . implode(" AND ", $conditions);
    }
    $sql .= " ORDER BY b.year DESC, b.month DESC, m.nickname ASC, m.consumer_name ASC";

    $stmt = @$conn->prepare($sql);
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'electricity_bill' does not exist. Please run sql/electricity.sql.", "rows" => [], "total" => 0]);
    }
    if ($params) {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $result = $stmt->get_result();

    $rows = [];
    $total = 0.0;
    while ($row = $result->fetch_assoc()) {
        $row["amount"] = (float)$row["amount"];
        $total += $row["amount"];
        $rows[] = $row;
    }

    return json_encode(["status" => "success", "rows" => $rows, "total" => $total]);
}

function saveElectricityBill() {
    $conn = getDbConnection();
    $obj = getPostData();
    $meterId = (int)($obj->meter_id ?? 0);
    $month = (int)($obj->month ?? 0);
    $year = (int)($obj->year ?? 0);
    $amount = (float)($obj->amount ?? 0);

    if ($meterId <= 0) {
        return json_encode(["status" => "failed", "error" => "Select a meter"]);
    }
    if ($month < 1 || $month > 12 || $year < 2000) {
        return json_encode(["status" => "failed", "error" => "Valid month and year are required"]);
    }
    if ($amount < 0) {
        return json_encode(["status" => "failed", "error" => "Bill amount cannot be negative"]);
    }

    // One bill per meter per month: saving the same period again replaces it.
    $stmt = @$conn->prepare(
        "INSERT INTO `electricity_bill` (`meter_id`, `month`, `year`, `amount`)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE `amount` = VALUES(`amount`)"
    );
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'electricity_bill' does not exist. Please run sql/electricity.sql."]);
    }
    $stmt->bind_param("iiid", $meterId, $month, $year, $amount);

    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed", "error" => "Could not save the bill"]);
}

function deleteElectricityBill() {
    $conn = getDbConnection();
    $obj = getPostData();
    $id = (int)($obj->id ?? 0);

    if ($id <= 0) {
        return json_encode(["status" => "failed", "error" => "Bill id is required"]);
    }
    $stmt = @$conn->prepare("DELETE FROM `electricity_bill` WHERE `id` = ?");
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'electricity_bill' does not exist. Please run sql/electricity.sql."]);
    }
    $stmt->bind_param("i", $id);
    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed", "error" => "Could not delete the bill"]);
}

// --- Old dues carried in from a hand-maintained CSV ---

/**
 * Reads `data/<office>.csv` (columns: Party Name, Current, OD, Total) so the
 * Tagada Slip can pull in dues that predate the transaction data. The files are
 * meant to be edited by hand in Excel, so anything unparseable is skipped
 * rather than failing the whole load. The Total column is ignored: the screen
 * recomputes it, which keeps a stale total in the file from being trusted.
 */
function getOldData() {
    $obj = getPostData();
    $office = trim($obj->office ?? '');

    // The office name becomes part of a file path, so keep it to a safe shape.
    if ($office === '' || !preg_match('/^[A-Za-z0-9 _-]+$/', $office)) {
        return json_encode(["status" => "failed", "error" => "Invalid office name"]);
    }

    $file = __DIR__ . DIRECTORY_SEPARATOR . ".." . DIRECTORY_SEPARATOR . "data" . DIRECTORY_SEPARATOR . $office . ".csv";
    if (!is_file($file)) {
        return json_encode([
            "status" => "failed",
            "error" => "No old data file for " . $office . ". Expected data/" . $office . ".csv"
        ]);
    }

    $handle = @fopen($file, "r");
    if (!$handle) {
        return json_encode(["status" => "failed", "error" => "Could not read data/" . $office . ".csv"]);
    }

    $rows = [];
    while (($cols = fgetcsv($handle, 0, ",", "\"", "\\")) !== false) {
        if (!isset($cols[0])) {
            continue;
        }
        // Excel puts a BOM ahead of the very first cell.
        $name = trim(preg_replace('/^\xEF\xBB\xBF/', '', (string)$cols[0]));
        if ($name === "" || strcasecmp($name, "Party Name") === 0) {
            continue;
        }
        $rows[] = [
            "partyName" => $name,
            "current" => isset($cols[1]) ? (float)str_replace(",", "", $cols[1]) : 0,
            "od" => isset($cols[2]) ? (float)str_replace(",", "", $cols[2]) : 0,
        ];
    }
    fclose($handle);

    return json_encode(["status" => "success", "rows" => $rows]);
}

function deleteNotice() {
    $conn = getDbConnection();
    $obj = getPostData();
    $id = (int)($obj->id ?? 0);

    if ($id <= 0) {
        return json_encode(["status" => "failed", "error" => "Notice id is required"]);
    }

    // notice_client rows go with it via ON DELETE CASCADE.
    $stmt = @$conn->prepare("DELETE FROM `notice` WHERE `id` = ?");
    if (!$stmt) {
        return json_encode(["status" => "failed", "error" => "Table 'notice' does not exist. Please run sql/notice.sql."]);
    }
    $stmt->bind_param("i", $id);

    if ($stmt->execute()) {
        return json_encode(["status" => "success"]);
    }
    return json_encode(["status" => "failed", "error" => "Could not delete notice"]);
}

?>
